# 使用 Eclipse Temurin JDK 17 作为基础镜像
FROM eclipse-temurin:17-jdk

# 安装 Python 3 和 pip
RUN apt-get update && \
    apt-get install -y python3 python3-pip && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖
# 注意: pillow 等库可能需要编译依赖，如果 slim 镜像缺失可能会报错
# 为了稳定，可以安装一些基础构建工具，但尽量保持精简
RUN pip3 install --break-system-packages --no-cache-dir ezdxf openpyxl pillow

# 设置工作目录
WORKDIR /app

# 复制编译好的 JAR 包 (假设 Maven 构建在外部或多阶段构建，这里简化为直接复制)
# 实际开发中通常使用 Maven Wrapper 在 Docker 内构建，或者复制 target/*.jar
# 这里采用多阶段构建

# --- Build Stage (cache Maven dependencies) ---
FROM maven:3.9.6-eclipse-temurin-17 AS deps
WORKDIR /build
# 仅复制 pom.xml，预先下载依赖，作为可复用的缓存层
COPY pom.xml .
COPY settings.xml /root/.m2/settings.xml
RUN mvn -B -e -DskipTests -s /root/.m2/settings.xml dependency:go-offline

# 实际构建阶段：复用上一阶段的本地仓库，加快构建并减少网络依赖
FROM maven:3.9.6-eclipse-temurin-17 AS build
WORKDIR /build
COPY --from=deps /root/.m2 /root/.m2
COPY pom.xml .
COPY src ./src
RUN mvn -B -DskipTests -s /root/.m2/settings.xml package

# --- Run Stage ---
FROM eclipse-temurin:17-jdk
WORKDIR /app

# 安装 Python 环境 (再次安装，因为是新的阶段)
RUN apt-get update && \
    apt-get install -y python3 python3-pip && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
RUN pip3 install --break-system-packages --no-cache-dir ezdxf openpyxl pillow

# 从构建阶段复制 JAR
COPY --from=build /build/target/*.jar app.jar

# 暴露端口
EXPOSE 8080

# 启动命令
ENTRYPOINT ["java", "-jar", "app.jar"]
