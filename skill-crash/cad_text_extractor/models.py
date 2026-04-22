from dataclasses import dataclass, field
from typing import List


@dataclass
class Area:
    name: str = ""
    value: float = 0.0
    expression: str = ""
    attr1: str = ""
    attr2: str = ""
    elseAttribute: str = ""
    is_public: bool = False


@dataclass
class Box:
    name: str = ""
    Building: str = ""
    Floor: str = ""
    areas: List[Area] = field(default_factory=list)
