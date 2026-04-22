import ezdxf
import os
import struct
from typing import List, Tuple, Optional, Dict
import json
from dataclasses import dataclass, field
import re
import math
from decimal import Decimal, ROUND_HALF_UP, ROUND_DOWN
from models import Area, Box

def my_round(val: float, ndigits: int = 2) -> float:
    """
    使用 standard arithmetic rounding (四舍五入) 而非 Python 默认的 round half to even
    策略：先截断到 ndigits+1 位（忽略 ndigits+2 位及以后的数值），再四舍五入到 ndigits 位
    例如：12.2349 -> 12.234 -> 12.23; 12.2351 -> 12.235 -> 12.24
    """
    try:
        d = Decimal(str(val))
        # 先截断到 ndigits + 1 位 (ROUND_DOWN)
        d_temp = d.quantize(Decimal("0.1") ** (ndigits + 1), rounding=ROUND_DOWN)
        # 再四舍五入到 ndigits 位 (ROUND_HALF_UP)
        return float(d_temp.quantize(Decimal("0.1") ** ndigits, rounding=ROUND_HALF_UP))
    except Exception:
        return round(val, ndigits)

# 目的：
# - 从 DXF 文件中定位“打印图框”图层的边界框
#   · 优先使用 LWPOLYLINE 顶点集合计算每个框的外接矩形
#   · 若该层没有多段线，则使用 LINE 的端点集合计算整体外接矩形
# - 统计“打印图框”图层上常见实体类型数量，并输出若干示例
# - 在所有图层中，提取落入打印框内的文本（TEXT/MTEXT）、块属性（ATTRIB）
# - 对没有属性的块参照（INSERT）展开其虚拟实体，统计并采集落入框内的文本及类型计数
# - 将结果写入 JSON（output/frame_content.json），便于后续处理与检查

dwg_path = "d:\\WXL\\Code\\autoCadPy\\input\\layer.dxf"
frame_layer = "打印图框"
PROJECT_NAME = "青山区31街坊建设项目"



def is_dxf_file(file_path):
    """
    粗略判断文件是否为 ASCII DXF：
    - 读取文件头前若干字节
    - 检测是否出现典型的 "0" 或 "999" 分组起始（文本 DXF 的常见特征）
    说明：该判断并不严格，仅用于快速区分二进制 DWG 与文本 DXF
    """
    try:
        with open(file_path, 'rb') as f:
            header = f.read(128)
            return b'0\r\n' in header[:10] or b'999\r\n' in header[:10]
    except:
        return False

def _boxes_from_frame(ms) -> List[Tuple[float, float, float, float]]:
    """
    基于“打印图框”图层生成边界框列表：
    - 优先使用该层所有 LWPOLYLINE 的点集生成其外接矩形（每条多段线一个盒子）
    - 若没有多段线，则回退使用该层所有 LINE 端点的整体外接矩形（一个盒子）
    返回：[(minx, miny, maxx, maxy), ...]
    """
    boxes = []
    # 遍历该层所有轻量多段线（LWPOLYLINE），对每条线计算其外接矩形
    for pl in ms.query(f'LWPOLYLINE[layer=="{frame_layer}"]'):
        try:
            pts = list(pl.get_points("xy"))
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            if xs and ys:
                boxes.append((min(xs), min(ys), max(xs), max(ys)))
        except Exception:
            pass
    # 若没有任何多段线盒子，回退到该层所有直线（LINE）的端点集合，合并为一个外接矩形
    if not boxes:
        xs = []
        ys = []
        for ln in ms.query(f'LINE[layer=="{frame_layer}"]'):
            try:
                xs.extend([ln.dxf.start.x, ln.dxf.end.x])
                ys.extend([ln.dxf.start.y, ln.dxf.end.y])
            except Exception:
                pass
        if xs and ys:
            boxes.append((min(xs), min(ys), max(xs), max(ys)))
    return boxes

def _pt_in_box(x: float, y: float, box: Tuple[float, float, float, float]) -> bool:
    """
    判断点 (x, y) 是否落入给定盒子 box=(minx, miny, maxx, maxy)
    - 边界包含：点落在边界上也视为在盒内
    """
    return (box[0] <= x <= box[2]) and (box[1] <= y <= box[3])

def _entity_points(e, dxfname) -> List[Tuple[float, float]]:
    """
    提取实体的代表点坐标，用于与打印框进行空间判断：
    - TEXT/MTEXT/INSERT：插入点（文本位置或块参照位置）
    - LINE：起点与终点（两点均参与判断）
    - LWPOLYLINE/POLYLINE：顶点集合（所有顶点参与判断）
    - CIRCLE/ARC/ELLIPSE：圆心/中心点
    - HATCH：外接框中心点（若可计算）
    - DIMENSION/LEADER/SPLINE：选择常用参考点或控制点
    返回：[(x, y), ...]
    """
    pts = []
    try:
        if dxfname == "TEXT":
            # 文字的插入点
            p = e.dxf.insert
            pts.append((p.x, p.y))
        elif dxfname == "MTEXT":
            # 多行文字的插入点
            p = e.dxf.insert
            pts.append((p.x, p.y))
        elif dxfname == "INSERT":
            # 块参照的插入点
            p = e.dxf.insert
            pts.append((p.x, p.y))
            # 同时采集块属性的插入点
            for att in getattr(e, "attribs", []):
                ap = att.dxf.insert
                pts.append((ap.x, ap.y))
        elif dxfname == "LINE":
            # 直线的起点与终点
            s = e.dxf.start
            t = e.dxf.end
            pts.append((s.x, s.y))
            pts.append((t.x, t.y))
        elif dxfname == "LWPOLYLINE":
            # 轻量多段线的所有顶点
            for x, y, *_ in e.get_points("xyb"):
                pts.append((x, y))
        elif dxfname == "POLYLINE":
            # 经典多段线的所有顶点
            for v in e.vertices:
                pts.append((v.dxf.location.x, v.dxf.location.y))
        elif dxfname in ("CIRCLE", "ARC", "ELLIPSE"):
            # 圆/弧/椭圆的中心
            c = e.dxf.center
            pts.append((c.x, c.y))
        elif dxfname == "SPLINE":
            # 样条的控制点
            for cp in getattr(e, "control_points", []):
                pts.append((cp[0], cp[1]))
        elif dxfname == "DIMENSION":
            # 标注的文字中点或定义点（若存在）
            if hasattr(e.dxf, "text_midpoint"):
                p = e.dxf.text_midpoint
                pts.append((p.x, p.y))
            elif hasattr(e.dxf, "defpoint"):
                p = e.dxf.defpoint
                pts.append((p.x, p.y))
        elif dxfname == "LEADER":
            # 引线的顶点集合
            for v in getattr(e, "vertices", []):
                pts.append((v[0], v[1]))
        elif dxfname == "HATCH":
            # 填充的外接框中心点（若能计算外接框）
            bb = None
            try:
                bb = e.bbox()
            except Exception:
                bb = None
            if bb:
                x = (bb.extmin.x + bb.extmax.x) / 2.0
                y = (bb.extmin.y + bb.extmax.y) / 2.0
                pts.append((x, y))
    except Exception:
        pass
    return pts

def _collect_block_contents(br, box):
    """
    展开块参照 br，遍历其虚拟实体集合并采集落入盒内的文本与类型计数：
    - 使用栈迭代虚拟实体（非递归），并设置有限深度 depth_limit 防止深层嵌套
    - 对落入指定 box 的 TEXT/MTEXT，收集文本与坐标
    - 对所有虚拟实体进行类型计数（包含 INSERT）
    返回结构：
    {
      texts: [{text, x, y}],
      mtexts: [{text, x, y}],
      counts: {TEXT, MTEXT, LINE, ...}
    }
    """
    result = {
        "texts": [],
        "mtexts": [],
        "counts": {
            "TEXT": 0,
            "MTEXT": 0,
            "LINE": 0,
            "LWPOLYLINE": 0,
            "POLYLINE": 0,
            "CIRCLE": 0,
            "ARC": 0,
            "ELLIPSE": 0,
            "HATCH": 0,
            "SPLINE": 0,
            "DIMENSION": 0,
            "LEADER": 0,
            "INSERT": 0,
        },
    }
    # 通过 virtual_entities 获取块内虚拟实体集合，入栈以便遍历
    stack = list(getattr(br, "virtual_entities", lambda: [])())
    depth_limit = 2
    while stack and depth_limit >= 0:
        ve = stack.pop()
        dxftype = ve.dxftype()
        pts = _entity_points(ve, dxftype)
        in_box = any(_pt_in_box(x, y, box) for x, y in pts) if pts else False
        if in_box:
            if dxftype == "TEXT":
                try:
                    p = ve.dxf.insert
                    result["texts"].append({"text": ve.dxf.text, "x": p.x, "y": p.y})
                except Exception:
                    pass
            elif dxftype == "MTEXT":
                try:
                    p = ve.dxf.insert
                    result["mtexts"].append({"text": ve.text, "x": p.x, "y": p.y})
                except Exception:
                    pass
            if dxftype in result["counts"]:
                result["counts"][dxftype] += 1
        if dxftype == "INSERT":
            # 对嵌套块参照计数，并在有限深度内继续展开
            result["counts"]["INSERT"] += 1
            depth_limit -= 1
            try:
                nested = list(getattr(ve, "virtual_entities", lambda: [])())
                stack.extend(nested)
            except Exception:
                pass
    return result

def cad_text_extractor(dwg_path, frame_layer, PROJECT_NAME, output_dir=None):
    """
    从指定 DXF 文件中提取“打印图框”图层上的文本内容，分类并写入 JSON 文件。
    参数：
    - dwg_path: DXF 文件路径（支持 ASCII DXF 与二进制 DWG）
    - frame_layer: 目标图层名称（默认 "打印图框"）
    - PROJECT_NAME: 项目名称，用于 JSON 文件名（默认 "项目名称"）
    - output_dir: 输出目录，默认为 None（使用 input 的上一级 output 目录或自定义）
    """
    try:
        # 基本文件类型检查（仅区分文本 DXF 与二进制 DWG）
        if not is_dxf_file(dwg_path):
            print(f"文件 '{dwg_path}' 不是ASCII DXF文件，而是二进制DWG文件")
            print("提示：ezdxf主要支持ASCII DXF格式。您需要先将DWG转换为DXF格式，例如使用AutoCAD的\"另存为DXF\"功能，或使用其他转换工具。")
            exit()
        
        # 读取 DXF 文档与模型空间
        doc = ezdxf.readfile(dwg_path)
        print(f"已打开文件: {dwg_path}")
        
        model_space = doc.modelspace()
        
        # 统计“打印图框”图层上的常见实体类型数量，并输出示例
        print(f"\n图层 '{frame_layer}' 中的实体统计和示例：")
        type_specs = [
            ("TEXT", 'TEXT'),
            ("MTEXT", 'MTEXT'),
            ("块参照", 'INSERT'),
            ("线段", 'LINE'),
            ("轻量多段线", 'LWPOLYLINE'),
            ("多段线", 'POLYLINE'),
            ("圆", 'CIRCLE'),
            ("弧", 'ARC'),
            ("椭圆", 'ELLIPSE'),
            ("填充", 'HATCH'),
            ("样条", 'SPLINE'),
            ("标注", 'DIMENSION'),
            ("引线", 'LEADER'),
        ]
        total_on_layer = 0
        for label, dxfname in type_specs:
            ents = list(model_space.query(f'{dxfname}[layer=="{frame_layer}"]'))
            cnt = len(ents)
            total_on_layer += cnt
            if cnt:
                print(f"{label}: {cnt}")
                sample = ents[:3]
                for idx, e in enumerate(sample, 1):
                    try:
                        if dxfname == "TEXT":
                            print(f"  示例{idx}: {e.dxf.text}")
                        elif dxfname == "MTEXT":
                            print(f"  示例{idx}: {e.text}")
                        elif dxfname == "INSERT":
                            print(f"  示例{idx}: 块名={e.dxf.name}")
                        else:
                            print(f"  示例{idx}: 句柄={e.dxf.handle}")
                    except Exception:
                        pass
        if total_on_layer == 0:
            print(f"图层 '{frame_layer}' 中未找到实体")
        
        # 检测打印框盒子（可能有多个）
        boxes = _boxes_from_frame(model_space)
        if boxes:
            print(f"\n检测到打印框区域数量: {len(boxes)}")
        else:
            print("\n未检测到可用的打印框区域")
        
        boxs: List[Box] = []

        if boxes:
            print("\n打印框内的文字与块属性：")
            results = {
                "source_file": dwg_path,
                "frame_layer": frame_layer,
                "boxes": [],
            }
            inner_count = 0
            # 初始化盒子条目
            for idx, b in enumerate(boxes, 1):
                box_entry = {
                    "index": idx,
                    "bbox": {"minx": b[0], "miny": b[1], "maxx": b[2], "maxy": b[3]},
                    "texts": [],
                    "polylines": [],
                    "counts": {},
                }
                results["boxes"].append(box_entry)
            # 辅助函数：判断是否落入任意盒子，以及返回落入的盒子索引列表
            def _in_any_box(x, y):
                return any(_pt_in_box(x, y, b) for b in boxes)
            def _get_box_indexes(x, y):
                idxs = []
                for i, b in enumerate(boxes):
                    if _pt_in_box(x, y, b):
                        idxs.append(i)
                return idxs
            # 采集 TEXT
            for text in model_space.query('TEXT'):
                try:
                    p = text.dxf.insert
                    if _in_any_box(p.x, p.y):
                        inner_count += 1
                        for bi in _get_box_indexes(p.x, p.y):
                            results["boxes"][bi]["texts"].append({
                                "text": text.dxf.text,
                                "x": p.x, "y": p.y,
                                "layer": text.dxf.layer,
                            })
                except Exception:
                    pass
            # 采集多段线并计算面积
            def _polyline_vertices_dxf(e):
                pts = []
                try:
                    dxftype = e.dxftype()
                    if dxftype == "LWPOLYLINE":
                        # get_points("xyb") returns (x, y, bulge)
                        for x, y, b in e.get_points("xyb"):
                            pts.append((x, y, b))
                    elif dxftype == "POLYLINE":
                        for v in e.vertices:
                            b = getattr(v.dxf, "bulge", 0)
                            pts.append((v.dxf.location.x, v.dxf.location.y, b))
                except Exception:
                    pass
                return pts
            def _poly_area(pts):
                n = len(pts)
                if n < 3:
                    return 0.0
                
                # 1. Polygon area (Shoelace formula)
                area_poly = 0.0
                for i in range(n):
                    x1, y1, _ = pts[i]
                    x2, y2, _ = pts[(i + 1) % n]
                    area_poly += x1 * y2 - x2 * y1
                area_poly *= 0.5
                
                # 2. Arc segments area (Bulge)
                area_arcs = 0.0
                for i in range(n):
                    x1, y1, b = pts[i]
                    x2, y2, _ = pts[(i + 1) % n]
                    
                    if b != 0:
                        dx = x2 - x1
                        dy = y2 - y1
                        L = math.hypot(dx, dy)
                        if L > 1e-9:
                            theta = 4 * math.atan(b)
                            # Radius R = L / (2 * sin(theta/2))
                            # Use abs(sin) for radius calculation
                            sin_half_theta = math.sin(theta/2)
                            R = L / (2 * abs(sin_half_theta))
                            
                            # Segment area = 0.5 * R^2 * (theta - sin(theta))
                            area_arcs += 0.5 * (R**2) * (theta - math.sin(theta))
                            
                return abs(area_poly + area_arcs)
            def _polyline_closed(e):
                return bool(getattr(e, "closed", False) or getattr(e, "is_closed", False))
            for e in list(model_space.query('LWPOLYLINE')) + list(model_space.query('POLYLINE')):
                try:
                    pts = _polyline_vertices_dxf(e)
                    if not pts:
                        continue
                    xs = [p[0] for p in pts]
                    ys = [p[1] for p in pts]
                    minx, maxx = (min(xs), max(xs))
                    miny, maxy = (min(ys), max(ys))
                    corners = [(minx, miny), (minx, maxy), (maxx, miny), (maxx, maxy)]
                    for bi, b in enumerate(boxes):
                        if all(_pt_in_box(x, y, b) for x, y in corners):
                            closed = _polyline_closed(e)
                            area_val = _poly_area(pts)
                            results["boxes"][bi]["polylines"].append({
                                "type": e.dxftype(),
                                "layer": getattr(e.dxf, "layer", ""),
                                "closed": closed,
                                "vertices": [{"x": p[0], "y": p[1], "bulge": p[2]} for p in pts],
                                "area": area_val,
                                "aci_color": getattr(e.dxf, "color", 256),
                                "true_color": getattr(e.dxf, "true_color", None),
                            })
                except Exception:
                    pass
            if inner_count == 0:
                print("未在打印框内找到文字")
            layer_names = [lyr.dxf.name for lyr in doc.layers]
            if "$面积结果" not in layer_names:
                try:
                    doc.layers.add("$面积结果")
                except Exception:
                    pass
            # 文字样式：默认使用 dw（若不存在则创建），用于统一面积结果与汇总的文字风格
            style_names = [st.dxf.name for st in doc.styles]
            if "dw" not in style_names:
                try:
                    doc.styles.add("dw")
                except Exception:
                    pass
            def _get_layer_color(doc_obj, name):
                try:
                    c = doc_obj.layers.get(name).dxf.color
                    if c in (0, 256):
                        return 7
                    return c
                except Exception:
                    return 7
            for box in results["boxes"]:
                placed_positions = []
                for pl in box.get("polylines", []):
                    ln = pl.get("layer", "")
                    area_val = pl.get("area", None)
                    verts = pl.get("vertices", [])
                    if isinstance(ln, str) and ln.startswith("面积") and area_val is not None and verts:
                        # 面积文本插入点：优先使用多边形质心，面积为0时回退到顶点均值
                        # 计算多边形质心（centroid）而不是简单平均值
                        n = len(verts)
                        if n > 0:
                            # 确保多边形闭合
                            verts_closed = verts + [verts[0]]
                            area = 0.0
                            cx = 0.0
                            cy = 0.0
                            
                            for i in range(n):
                                x_i, y_i = verts_closed[i]["x"], verts_closed[i]["y"]
                                x_j, y_j = verts_closed[i+1]["x"], verts_closed[i+1]["y"]
                                
                                term = x_i * y_j - x_j * y_i
                                area += term
                                cx += (x_i + x_j) * term
                                cy += (y_i + y_j) * term
                            
                            if area != 0.0:
                                area *= 0.5
                                cx = cx / (6.0 * area)
                                cy = cy / (6.0 * area)
                                avgx, avgy = cx, cy
                            else:
                                # 如果面积为0，回退到简单平均值
                                avgx = sum(v["x"] for v in verts) / len(verts)
                                avgy = sum(v["y"] for v in verts) / len(verts)
                        else:
                            avgx, avgy = 0.0, 0.0
                        bb = box.get("bbox", {})
                        bw = abs(bb.get("maxx", avgx) - bb.get("minx", avgx))
                        bh = abs(bb.get("maxy", avgy) - bb.get("miny", avgy))
                        # 面积文本高度：按盒子最大跨度的 1/120 缩放，兼顾显示密集场景
                        txt_h = max(bw, bh) / 100.0
                        # 简单邻近判定：若新位置与已放置位置在水平与垂直方向均不超过一个文字高度，则视为过近
                        def _too_close(x, y):
                            for px, py, ph in placed_positions:
                                th = ph if ph > txt_h else txt_h
                                if abs(x - px) <= th and abs(y - py) <= th:
                                    return True
                            return False
                        # 避让策略：沿 Y 方向按文字高度交替偏移，直到不靠近
                        if _too_close(avgx, avgy):
                            step = 1
                            while True:
                                dy = (step // 2 + (step % 2)) * txt_h
                                if step % 2 == 1:
                                    cand_y = avgy + dy
                                else:
                                    cand_y = avgy - dy
                                if not _too_close(avgx, cand_y):
                                    avgy = cand_y
                                    break
                                step += 1
                        s = f"{area_val:.2f}"
                        try:
                            # 插入面积文本：设置高度与样式，并将插入点水平居中（估算宽度为 len(s)*height）
                            t = model_space.add_text(s, dxfattribs={"height": txt_h, "style": "dw"})
                            t.dxf.layer = "$面积结果"
                            tw = len(s) * txt_h
                            t.dxf.insert = (avgx - tw / 2.0 + txt_h, avgy -  txt_h / 2.0)
                            placed_positions.append((avgx, avgy, txt_h))
                            # 文本颜色：优先使用实体 true_color，其次 ACI，最后回退到图层颜色
                            tc = pl.get("true_color", None)
                            aci = pl.get("aci_color", 256)
                            if tc not in (None, 0):
                                t.dxf.true_color = tc
                            elif aci not in (0, 256):
                                t.dxf.color = aci
                            else:
                                t.dxf.color = _get_layer_color(doc, ln)
                        except Exception:
                            pass
            calc_layer_names = [lyr.dxf.name for lyr in doc.layers]
            if "$计算结果" not in calc_layer_names:
                try:
                    doc.layers.add("$计算结果")
                except Exception:
                    pass
            if "$计容结果" not in calc_layer_names:
                try:
                    doc.layers.add("$计容结果")
                except Exception:
                    pass
                
            for box in results["boxes"]:
                bbox = box.get("bbox", {})
                minx = bbox.get("minx", 0.0)
                miny = bbox.get("miny", 0.0)
                maxx = bbox.get("maxx", 1000.0)
                maxy = bbox.get("maxy", 1000.0)
                bw = abs(maxx - minx)
                bh = abs(maxy - miny)
                center_x = (minx + maxx) / 2.0
                # 汇总MTEXT基线：以盒子底部向上15%作为纵向基线，用于插入汇总块
                base_y = miny + bh * 0.15
                txt_h = bh / 100.0
                summary_positions = []
                def _sum_too_close(x, y):
                    for px, py, ph in summary_positions:
                        th = ph if ph > txt_h else txt_h
                        if abs(x - px) <= th and abs(y - py) <= th:
                            return True
                    return False
                # 解析盒子名称：项目名 + 楼 + 层
                name_txt = None
                building = ""
                floor = ""
                proj_pat = re.compile(rf"^{re.escape(PROJECT_NAME)}(.+?)楼(.+?)层$")
                for t in box.get("texts", []):
                    tx = t.get("text", "")
                    m = proj_pat.match(tx)
                    if m:
                        building = m.group(1)
                        floor = m.group(2)
                        name_txt = f"{building}楼{floor}层"
                        break
                if not name_txt:
                    bi = box.get("index", 0)
                    print(f"box{bi}没有")

                # ---------------------------------------------------------
                # 新逻辑：统一处理“面积-”图层
                # ---------------------------------------------------------
                # 0. 检查是否存在“一层平面图”以计算建筑基底面积
                # has_floor1 = any(t.get("text") == "一层平面图" for t in box.get("texts", []))
                # 改为从解析出的 floor 判断是否为 1 层
                # has_floor1 = (floor == "1") (不再依赖楼层，改为依赖特定图层)
                
                layer_data: Dict[str, List[float]] = {}
                layer_meta: Dict[str, Tuple[str, str, float]] = {}
                
                # 用于基底面积计算的累加器和表达式组件
                basal_total_val = 0.0
                basal_components = []

                for pl in box.get("polylines", []):
                    ln = pl.get("layer", "")
                    a = pl.get("area", None)
                    if not (isinstance(ln, str) and ln.startswith("面积-") and a is not None):
                        continue
                    
                    # 解析图层名：面积-<elseAttribute>-<name>-<coefficient>
                    # 示例：面积-计容-住宅-1 或 面积-计容-住宅--1 或 面积-计容-住宅-0.5
                    
                    # 1. 提取系数 (从右向左解析)
                    head, sep, tail = ln.rpartition("-")
                    
                    # 检查尾部是否为数字
                    try:
                        val_coeff = float(tail)
                    except ValueError:
                        continue
                        
                    # 处理负号情况：如果分割后的头部以 "-" 结尾，说明原字符串是 "--1" 这种形式
                    if head.endswith("-"):
                        coefficient = -val_coeff
                        head = head[:-1] # 移除负号，剩下的部分作为新的头部
                    else:
                        coefficient = val_coeff
                        
                    # 2. 解析剩余部分：面积-<elseAttribute>-<name>
                    # head 现在应该是 "面积-计容-住宅"
                    parts = head.split("-")
                    
                    if len(parts) < 3: 
                        continue
                    
                    if parts[0] != "面积":
                        continue
                        
                    elseAttribute = parts[1]
                    name = parts[2]
                    # 如果 name 中也包含横杠，parts 长度会大于 3，这里假设前两个固定，后面都是 name
                    if len(parts) > 3:
                        name = "-".join(parts[2:])
                        
                    val = my_round(float(a), 2)
                    layer_data.setdefault(ln, []).append(val)
                    layer_meta[ln] = (name, elseAttribute, coefficient)
                    
                    # 计算基底面积：改为只统计“面积-基底-基底-x”图层
                    # 规则：不采用对所有的叠加，而是会有单独的一个图层
                    if elseAttribute == "基底" and name == "基底":
                         basal_components.append(val)
                         basal_total_val += val

                # ---------------------------------------------------------
                # 聚合数据并构建 Area 对象
                # ---------------------------------------------------------
                # 中间结构： (name, elseAttribute) -> List[Tuple[value, coefficient]]
                grouped_data: Dict[Tuple[str, str], List[Tuple[float, float]]] = {}
                
                for ln, vals in layer_data.items():
                    if not vals:
                        continue
                    name, attr, coeff = layer_meta[ln]
                    # 保留每个细项数据，不合并，以便在表达式中展示所有细节
                    for val in vals:
                        grouped_data.setdefault((name, attr), []).append((val, coeff))
                
                box_areas: List[Area] = []
                lines = []
                
                # 如果检测到了基底面积数据，插入建筑基底面积到 Area 和 lines 的第一位
                if basal_components:
                    basal_total_val = my_round(basal_total_val, 2)
                    
                    # 构建基底面积表达式：单纯加和，不显示括号及系数
                    basal_components.sort(reverse=True)
                    basal_expression = " + ".join([f"{v:.2f}" for v in basal_components])
                    if not basal_expression:
                        basal_expression = "0.00"

                    basal_area_obj = Area(
                        name="建筑基底面积",
                        elseAttribute="",
                        value=basal_total_val,
                        expression=basal_expression
                    )
                    box_areas.append(basal_area_obj)
                    lines.append(f"建筑基底面积：{basal_expression} = {basal_total_val:.2f}")

                overall_jirong_val = 0.0
                overall_bujirong_val = 0.0
                jirong_summaries = []
                bujirong_summaries = []
                category_totals: Dict[str, float] = {}
                category_summaries: Dict[str, List[Tuple[str, float]]] = {}
                
                category_order = sorted({attr for _, attr in grouped_data.keys()})
                
                for attr in category_order:
                    if attr == "基底":
                        continue
                    names_in_cat = sorted([name for (name, a) in grouped_data.keys() if a == attr])
                    for name in names_in_cat:
                        items = grouped_data[(name, attr)]
                        coeff_groups: Dict[float, List[float]] = {}
                        for val, coeff in items:
                            coeff_groups.setdefault(coeff, []).append(val)
                        sorted_coeffs = sorted(coeff_groups.keys(), key=lambda c: (c > 0, c), reverse=True)
                        total_val = 0.0
                        components = []
                        for coeff in sorted_coeffs:
                            vals = coeff_groups[coeff]
                            vals.sort(reverse=True)
                            group_sum = sum(vals)
                            term_val = group_sum * coeff
                            total_val += term_val
                            vals_str = " + ".join([f"{v:.2f}" for v in vals])
                            if coeff == 1:
                                term_str = vals_str
                            elif coeff == -1:
                                term_str = f"-({vals_str})"
                            elif coeff == 0.5:
                                term_str = f"0.5*({vals_str})"
                            elif coeff == -0.5:
                                term_str = f"-0.5*({vals_str})"
                            else:
                                term_str = f"{coeff}*({vals_str})"
                            components.append(term_str)
                        if not components:
                            continue
                        expression = components[0]
                        for comp in components[1:]:
                            if comp.startswith("-") or comp.startswith(" -"):
                                expression += f" {comp}"
                            else:
                                expression += f" + {comp}"
                        total_val = my_round(total_val, 2)
                        area_obj = Area(
                            name=name,
                            elseAttribute=attr,
                            value=total_val,
                            expression=expression
                        )
                        box_areas.append(area_obj)
                        lines.append(f"  {name}{attr}面积：{expression} = {total_val:.2f}")
                        category_totals[attr] = category_totals.get(attr, 0.0) + total_val
                        category_summaries.setdefault(attr, []).append((f"{name}{attr}面积", total_val))
                    summaries = category_summaries.get(attr, [])
                    total_val_cat = my_round(category_totals.get(attr, 0.0), 2)
                    if not summaries:
                        lines.append(f"{attr}建筑面积：{total_val_cat:.2f}")
                    else:
                        summary_vals_str = []
                        for _, val in summaries:
                            if val >= 0:
                                summary_vals_str.append(f"{val:.2f}")
                            else:
                                summary_vals_str.append(f"({val:.2f})")
                        summary_expr = " + ".join(summary_vals_str)
                        summary_expr = summary_expr.replace(" + -", " - ")
                        lines.append(f"本层{attr}建筑面积：{summary_expr} = {total_val_cat:.2f}")
                    if ("计容" in attr) and ("不计容" not in attr):
                        overall_jirong_val = total_val_cat
                        jirong_summaries = summaries
                    elif "不计容" in attr:
                        overall_bujirong_val = total_val_cat
                        bujirong_summaries = summaries

                total_all = sum(category_totals.get(a, 0.0) for a in category_order if a != "基底")
                ordered_cats = [a for a in category_order if a != "基底" and a in category_totals]
                total_all = my_round(total_all, 2)
                if not ordered_cats:
                    lines.append(f"总面积：{total_all:.2f}")
                else:
                    expr_vals = []
                    for a in ordered_cats:
                        v = category_totals.get(a, 0.0)
                        if v >= 0:
                            expr_vals.append(f"{v:.2f}")
                        else:
                            expr_vals.append(f"({v:.2f})")
                    sum_expr = " + ".join(expr_vals).replace(" + -", " - ")
                    lines.append(f"总面积：{sum_expr} = {total_all:.2f}")

                # 解析盒子名称：项目名 + 楼 + 层 (已移动到上方)
                
                # 插入 "本层计容建筑面积" 单行文本（保留原有逻辑，但使用新的 total）
                overall_total = overall_jirong_val
                try:
                    plane_texts = [t for t in box.get("texts", []) if isinstance(t.get("text"), str) and t.get("text").endswith("平面图")]
                    anchor = None
                    if plane_texts:
                        anchor = min(plane_texts, key=lambda t: t.get("x", 0.0))
                    new_h = max(bw, bh) / 100.0
                    txt = f"本层计容建筑面积{overall_total:.2f}平方米"
                    tw = len(txt) * new_h
                    if anchor is not None:
                        cx = anchor.get("x", center_x)
                        cy = anchor.get("y", base_y)
                    else:
                        cx = center_x
                        cy = base_y
                    ins_x = cx - tw / 2.0 + len(anchor.get("text", "")) * new_h
                    ins_y = cy - 3.0 * new_h
                    t = model_space.add_text(txt, dxfattribs={"style": "dw", "height": new_h, "layer": "$计容结果"})
                    t.dxf.insert = (ins_x, ins_y)
                except Exception:
                    pass

                if lines:
                    # MTEXT插入位置说明：
                    # - 水平：以盒子中心为中点，取块宽度block_w（最长行估算并限制为盒子宽度的3/4）左侧点作为插入点；
                    #   结合attachment_point=4（左中），实现整体水平居中但行内左对齐
                    # - 垂直：以base_y为基线（盒子底部上方15%），若与既有汇总位置过近，则按字符高度上下交替偏移避让
                    # - 宽度：mtext.width=block_w 控制自动换行，避免超出盒子可视范围
                    txt_h_2 =  bh / 80.0
                    max_line_w = max(len(l) * txt_h_2 for l in lines)
                    block_w_cap = bw * 0.75
                    block_w = max_line_w if max_line_w <= block_w_cap else block_w_cap
                    block_x = center_x - block_w / 2.0
                    block_y = base_y
                    if _sum_too_close(block_x, block_y):
                        step = 1
                        while True:
                            dy = (step // 2 + (step % 2)) * txt_h_2
                            cand_y = block_y + dy if step % 2 == 1 else block_y - dy
                            if not _sum_too_close(block_x, cand_y):
                                block_y = cand_y
                                break
                            step += 1
                    try:
                        # 插入 MTEXT：使用 dw 样式，设置字符高度与左中附着点（attachment_point=4）
                        m = model_space.add_mtext("\\P".join(lines), dxfattribs={"style": "dw"})
                        m.dxf.layer = "$计算结果"
                        m.dxf.char_height = txt_h_2
                        m.dxf.attachment_point = 4
                        m.dxf.width = block_w
                        m.dxf.insert = (block_x, block_y)
                        summary_positions.append((block_x, block_y, txt_h_2))
                    except Exception:
                        pass
                
                # 构建并保存 Box 对象
                box_obj = Box(
                    name=name_txt or "",
                    Building=building or "",
                    Floor=floor or "",
                    areas=box_areas,
                )
                boxs.append(box_obj)
            # 统计每个盒子内各类实体数量（跨所有图层）
            print("\n打印框内实体类型计数：")
            inner_specs = [
                ("TEXT", "TEXT"),
                ("MTEXT", "MTEXT"),
                ("INSERT", "INSERT"),
                ("LINE", "LINE"),
                ("LWPOLYLINE", "LWPOLYLINE"),
                ("POLYLINE", "POLYLINE"),
                ("CIRCLE", "CIRCLE"),
                ("ARC", "ARC"),
                ("ELLIPSE", "ELLIPSE"),
                ("HATCH", "HATCH"),
                ("SPLINE", "SPLINE"),
                ("DIMENSION", "DIMENSION"),
                ("LEADER", "LEADER"),
            ]
            for i, b in enumerate(boxes):
                box_counts = {}
                for label, dxfname in inner_specs:
                    count = 0
                    for e in model_space.query(dxfname):
                        pts = _entity_points(e, dxfname)
                        if any(_pt_in_box(x, y, b) for x, y in pts):
                            count += 1
                    box_counts[label] = count
                results["boxes"][i]["counts"] = box_counts
            # 输出文件路径
            if output_dir is None:
                out_dir = os.path.join(os.path.dirname(dwg_path), "..", "output")
            else:
                out_dir = output_dir

            os.makedirs(out_dir, exist_ok=True)
            
            # Use PROJECT_NAME for filenames
            json_name = f"{PROJECT_NAME}_content.json"
            dxf_name = f"{PROJECT_NAME}_area_result.dxf"

            out_path = os.path.abspath(os.path.join(out_dir, json_name))
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(results, f, ensure_ascii=False, indent=2)
            print(f"\n已写入JSON: {out_path}")
            try:
                out_dxf = os.path.abspath(os.path.join(out_dir, dxf_name))
                doc.saveas(out_dxf)
                print(f"已写入DXF: {out_dxf}")
            except Exception:
                pass
    
        return boxs
    except FileNotFoundError:
        print(f"文件未找到: {dwg_path}")
    except ezdxf.DXFError as e:
        print(f"无法读取DXF文件: {e}")
    except Exception as e:
        print(f"发生错误: {e}")

def run_batch(input_root, output_root, checker, reviewer):
    """
    Batch process DXF files in input_root and save results to output_root.
    """
    if not os.path.exists(input_root):
         print(f"Directory not found: {input_root}")
         return

    print(f"Processing DXF files in: {input_root}")
    print(f"Output will be saved to: {output_root}")

    for root, dirs, files in os.walk(input_root):
        for filename in files:
            if not filename.lower().endswith(".dxf"):
                continue
            
            file_path = os.path.join(root, filename)
            project_name = os.path.splitext(filename)[0]
            
            # 计算相对路径，以保持输出目录结构与输入一致
            rel_path = os.path.relpath(root, input_root)
            if rel_path == ".":
                target_out_dir = output_root
            else:
                target_out_dir = os.path.join(output_root, rel_path)
            
            # 确保输出目录存在
            os.makedirs(target_out_dir, exist_ok=True)
            
            print(f"\n--------------------------------------------------")
            print(f"Processing: {file_path}")
            print(f"Project Name: {project_name}")
            print(f"Output Dir: {target_out_dir}")
            
            try:
                # 提取文本并生成 DXF/JSON
                boxs = cad_text_extractor(
                    dwg_path=file_path, 
                    frame_layer="打印图框", 
                    PROJECT_NAME=project_name, 
                    output_dir=target_out_dir
                )
                
                # Export to Excel
                from excel_exporter import export_to_excel
                excel_name = f"{project_name}_面积计算表.xlsx"
                export_to_excel(
                    boxs, 
                    target_out_dir, 
                    filename=excel_name,
                    checker=checker,
                    reviewer=reviewer
                )
                
            except Exception as e:
                print(f"Failed to process {filename}: {e}")
                import traceback
                traceback.print_exc()

import sys

def __main__():
    """
    主函数：批量处理指定目录下的 DXF 文件。
    """
    # 优先从命令行获取参数
    if len(sys.argv) >= 3:
        input_root = sys.argv[1]
        output_root = sys.argv[2]
        CHECKER = sys.argv[3] if len(sys.argv) > 3 else "张三"
        REVIEWER = sys.argv[4] if len(sys.argv) > 4 else "李四"
        
        run_batch(input_root, output_root, CHECKER, REVIEWER)
        return

    # 配置项
    CHECKER = "张三"  # 校核者
    REVIEWER = "李四" # 检查者/检验者

    # 目标路径
    # 使用绝对路径或相对路径，此处根据当前文件位置推断
    current_dir = os.path.dirname(os.path.abspath(__file__))
    input_root = os.path.join(current_dir, "input")
    output_root = os.path.join(current_dir, "output")
    
    if not os.path.exists(input_root):
        # Fallback to the hardcoded path if relative path doesn't exist
        input_root = r"d:\WXL\Code\autoCadPy\input"
        output_root = r"d:\WXL\Code\autoCadPy\output"
    
    run_batch(input_root, output_root, CHECKER, REVIEWER)

if __name__ == "__main__":
    __main__()
