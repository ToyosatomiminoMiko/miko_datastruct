"""注册表:把普通 Python 类登记成"一种结构",并提供遍历 / Scene / JSON 的出口.

一个结构只有两件事要说清:

1. **字段角色**——属性(标量)还是指针(指向另一个已注册对象);指针由**类型标注**定死:
   `T | None` / `T` 是 0..1 条,`list[T]` / `Sequence[T]` 是 0..n 条.
2. **结构种类 `as_`**——`node`(默认,画成圆节点)/ `edge`(无向边)/ `container`
   (聚合根,自己不出现在画面里).

没有手写 `roles=`:能推断的从注解 / 标量默认值推断,推断不出来的**报错**,不静默兜底.
字段顺序 = 定义顺序 = Scene 里节点 / 边数组的顺序.

检查结论不在这份 JSON 里:web 侧「检查配置」窗口按函数名选择检查,载入后现算;
Python 侧只负责描述结构,不跑检查.
"""

from __future__ import annotations

import collections.abc
import dataclasses
import hashlib
import inspect
import re
import types
import typing
from enum import Enum
from types import MappingProxyType
from typing import Any, Callable, Iterable, Mapping

from .diagram import Diagram
from .errors import RegistrationError
from .roles import Attr, Pointer, Role
from .scene import Scene, SceneWriter
from .spec import MISSING, FieldSpec, StructureSpec
from .traversal import Graph, RenderContext

__all__ = ["Registry", "default_registry", "structure"]

_AS_VALUES = ("node", "edge", "container")
_SCALAR_TYPES = (bool, int, float, str)
_UNION_ORIGINS = (typing.Union, types.UnionType)
_SEQUENCE_ORIGINS = (
    list,
    tuple,
    collections.abc.Sequence,
    collections.abc.MutableSequence,
)
_MAPPING_ORIGINS = (dict, collections.abc.Mapping, collections.abc.MutableMapping)


class Registry:
    """一张结构注册表.主键是类对象,次键是 `spec.name`(结构名 / 快照里的键)."""

    def __init__(self, name: str = "default") -> None:
        self.name = name
        self._by_type: dict[type, StructureSpec] = {}
        self._by_name: dict[str, StructureSpec] = {}
        self._order: list[StructureSpec] = []

    # 注册

    def structure(
        self,
        cls: type | None = None,
        /,
        *,
        name: str | None = None,
        as_: str = "node",
        label: Callable[[Any], str] | str | None = None,
        subclasses: bool = False,
        override: bool = False,
        doc: str = "",
    ) -> Any:
        """装饰器:把一个类登记成结构,并**原样返回这个类**(不强制基类 / 元类).

        两种写法都行:`@reg.structure` 与 `@reg.structure(name="rbt", label=...)`.
        """

        def decorate(target: type) -> type:
            return self._register(
                target,
                name=name,
                as_=as_,
                label=label,
                subclasses=subclasses,
                override=override,
                doc=doc,
            )

        if cls is None:
            return decorate
        return decorate(cls)

    def _register(
        self,
        cls: type,
        *,
        name: str | None,
        as_: str,
        label: Callable[[Any], str] | str | None,
        subclasses: bool,
        override: bool,
        doc: str,
    ) -> type:
        if not isinstance(cls, type):
            raise RegistrationError("not-a-class", f"@structure 只能用在类上,实际 {cls!r}")
        if as_ not in _AS_VALUES:
            raise RegistrationError("bad-as", f"as_ 只能是 {_AS_VALUES},实际 {as_!r}")

        structure_name = name if name is not None else _snake_case(cls.__name__)
        if not structure_name:
            raise RegistrationError("bad-name", "结构名不能为空")

        conflicts: dict[int, StructureSpec] = {}
        for candidate in (self._by_name.get(structure_name), self._by_type.get(cls)):
            if candidate is not None:
                conflicts[id(candidate)] = candidate
        if conflicts and not override:
            other = next(iter(conflicts.values()))
            raise RegistrationError(
                "duplicate",
                f"名字 {structure_name!r} 或类 {_fqn(cls)} 已被 {other.fqn} 占用;需要覆盖时传 override=True",
            )
        for candidate in conflicts.values():
            self._remove(candidate)

        spec = StructureSpec(
            registry=self,
            cls=cls,
            name=structure_name,
            as_=as_,
            label=label,
            subclasses=subclasses,
            doc=doc or inspect.getdoc(cls) or "",
        )
        self._by_type[cls] = spec
        self._by_name[structure_name] = spec
        self._order.append(spec)
        return cls

    def _remove(self, spec: StructureSpec) -> None:
        self._by_type.pop(spec.cls, None)
        if self._by_name.get(spec.name) is spec:
            self._by_name.pop(spec.name, None)
        if spec in self._order:
            self._order.remove(spec)

    # 查询

    @property
    def structures(self) -> tuple[StructureSpec, ...]:
        """按注册顺序交回所有结构(只读元组)."""
        return tuple(self._order)

    def get(self, cls_or_obj: type | Any) -> StructureSpec:
        """按类或实例查 spec;只有 `subclasses=True` 的注册才允许沿 MRO 回退."""
        cls = cls_or_obj if isinstance(cls_or_obj, type) else type(cls_or_obj)
        spec = self._lookup_spec(cls)
        if spec is None:
            raise RegistrationError(
                "unknown-type",
                f"{_fqn(cls)} 未注册;用 @reg.structure 注册,或先检查 import",
            )
        return spec

    def by_name(self, name: str) -> StructureSpec:
        """按结构名查 spec."""
        spec = self._by_name.get(name)
        if spec is None:
            known = ", ".join(self._by_name) or "无"
            raise RegistrationError("unknown-structure", f"没有名为 {name!r} 的结构(已注册:{known})")
        return spec

    def _lookup_spec(self, cls: type) -> StructureSpec | None:
        spec = self._by_type.get(cls)
        if spec is not None:
            return spec
        for base in cls.__mro__[1:]:
            spec = self._by_type.get(base)
            if spec is not None and spec.subclasses:
                return spec
        return None

    def reset(self) -> None:
        """清空注册表(测试 / notebook 重载用);不动任何类对象."""
        self._by_type.clear()
        self._by_name.clear()
        self._order.clear()

    def finalize(self) -> None:
        """提前解析所有结构的字段表:前向引用 / 角色歧义在这里就报出来."""
        for spec in self._order:
            spec._fields = None
            spec.fingerprint = ""
        for spec in self._order:
            self._fields_for(spec)

    def describe(self) -> str:
        """调试用:结构 / 字段 / 角色表."""
        lines = [f"Registry {self.name!r}:{len(self._order)} 种结构"]
        for spec in self._order:
            extras = []
            if isinstance(spec.label, str):
                extras.append(f"label={spec.label}")
            if spec.subclasses:
                extras.append("subclasses=True")
            suffix = ("  " + " ".join(extras)) if extras else ""
            lines.append(f"- {spec.name}  ({spec.fqn})  as={spec.as_}{suffix}")
            for spec_field in spec.fields:
                lines.append(f"    {spec_field.name:<12} {_role_describe(spec_field.role)}")
        return "\n".join(lines)

    def snapshot(self) -> Mapping[str, Mapping[str, Any]]:
        """测试断言用的只读快照:结构与字段表(取一次就固定,改了 spec 也不会跟着变)."""
        data: dict[str, Mapping[str, Any]] = {}
        for spec in self._order:
            fields = []
            for spec_field in spec.fields:
                entry: dict[str, Any] = {"name": spec_field.name, "role": type(spec_field.role).__name__}
                if isinstance(spec_field.role, Pointer):
                    entry["target"] = _fqn(spec_field.role.target)
                    entry["many"] = spec_field.role.many
                fields.append(entry)
            data[spec.name] = {
                "cls": spec.fqn,
                "as_": spec.as_,
                "doc": spec.doc,
                "subclasses": spec.subclasses,
                "fingerprint": spec.fingerprint,
                "fields": tuple(fields),
            }
        return MappingProxyType(data)

    def new(self, cls: type, **values: Any) -> Any:
        """按 spec 建实例:dataclass 走 `cls(**values)`,普通类走 `cls()` + setattr."""
        self.get(cls)  # 未注册的类不该被当结构来建
        if dataclasses.is_dataclass(cls):
            return cls(**values)
        obj = cls()
        for key, value in values.items():
            setattr(obj, key, value)
        return obj

    # 输出

    def to_scene(self, root: Any) -> Scene:
        """生成中性场景(节点 / 有向指针 / 无向边,无坐标、不标树或图)."""
        return SceneWriter(self._graph(root)).write()

    def diagram(self, root: Any) -> Diagram:
        """一次遍历拿到中性 Scene;`Diagram.dumps()` 是 web 读的 JSON."""
        graph = self._graph(root)
        return Diagram(root=root, scene=SceneWriter(graph).write())

    def _graph(self, root: Any) -> Graph:
        return RenderContext(self, root).traverse()

    # 字段解析(延迟)

    def _fields_for(self, spec: StructureSpec) -> tuple[FieldSpec, ...]:
        if spec._fields is None:
            resolved = self._build_fields(spec)
            spec.fingerprint = _fingerprint(resolved)
            spec._fields = resolved
        return spec._fields

    def _build_fields(self, spec: StructureSpec) -> tuple[FieldSpec, ...]:
        annotations = self._annotations(spec.cls)
        candidates = _candidate_fields(spec.cls, annotations)

        fields: list[FieldSpec] = []
        for field_name, annotation, default in candidates:
            if annotation is not None:
                role = self._role_from_annotation(spec, field_name, annotation)
            else:
                role = self._role_from_default(spec, field_name, default)
            fields.append(FieldSpec(name=field_name, role=role, default=default, annotation=annotation))

        _validate_label_field(spec, fields)

        pointers = [spec_field for spec_field in fields if isinstance(spec_field.role, Pointer)]
        if spec.as_ == "edge":
            if len(pointers) != 2:
                raise RegistrationError(
                    "bad-edge",
                    f"as_='edge' 的结构 {spec.fqn} 需要恰好两个指针字段(起点 / 终点),实际 {len(pointers)} 个",
                )
            for spec_field in pointers:
                if spec_field.role.many:
                    raise RegistrationError(
                        "bad-edge",
                        f"边 {spec.fqn} 的端点 {spec_field.name} 不能是列表:一条边只有两个端点",
                    )
        return tuple(fields)

    def _annotations(self, cls: type) -> dict[str, Any]:
        try:
            return typing.get_type_hints(cls, include_extras=True)
        except Exception as exc:
            raise RegistrationError("annotation-error", f"解析 {_fqn(cls)} 的注解失败:{exc}") from exc

    def _role_from_default(self, spec: StructureSpec, field_name: str, default: Any) -> Role:
        if default is MISSING:
            raise RegistrationError(
                "ambiguous-role",
                f"{spec.fqn}.{field_name}:没有注解也没有默认值,推断不出角色;给它写类型标注",
            )
        if default is None:
            raise RegistrationError(
                "ambiguous-role",
                f"{spec.fqn}.{field_name} = None:这是空值还是指针?写类型标注(如 `left: Node | None = None`)",
            )
        if isinstance(default, Enum) or isinstance(default, _SCALAR_TYPES):
            return Attr()
        raise RegistrationError(
            "ambiguous-role",
            f"{spec.fqn}.{field_name}:默认值 {default!r} 推断不出角色;写类型标注",
        )

    def _role_from_annotation(self, spec: StructureSpec, field_name: str, annotation: Any) -> Role:
        base = _strip_annotated(annotation)
        if base is None or base is Any or base is object:
            raise RegistrationError(
                "ambiguous-role",
                f"{spec.fqn}.{field_name}:注解 {base!r} 既不是属性也不是指针",
            )

        origin = typing.get_origin(base)
        if origin in _UNION_ORIGINS:
            members = [item for item in typing.get_args(base) if item is not type(None)]
            if len(members) == 1:
                return self._role_from_annotation(spec, field_name, members[0])
            raise RegistrationError(
                "ambiguous-role",
                f"{spec.fqn}.{field_name}:联合类型只能有一个非 None 成员,实际 {base!r}",
            )

        if origin in _SEQUENCE_ORIGINS:
            element = _sequence_element(origin, typing.get_args(base))
            if element is None:
                raise RegistrationError(
                    "ambiguous-role",
                    f"{spec.fqn}.{field_name}:{base!r} 不是 `list[已注册结构]`,推断不出指针目标",
                )
            if self._lookup_spec(element) is not None:
                return Pointer(target=element, many=True)
            if _is_scalar_type(element):
                raise RegistrationError(
                    "unsupported-list",
                    f"{spec.fqn}.{field_name}:数组类结构暂未支持(`{base!r}`);现在 list 只能用来写一组指针",
                )
            raise RegistrationError(
                "ambiguous-role",
                f"{spec.fqn}.{field_name}:{element!r} 未注册,推断不出指针目标",
            )

        if origin in _MAPPING_ORIGINS:
            raise RegistrationError(
                "ambiguous-role",
                f"{spec.fqn}.{field_name}:暂不支持映射字段;要一组指针请用 list[已注册结构]",
            )

        if isinstance(base, type):
            if issubclass(base, Enum) or base in _SCALAR_TYPES:
                return Attr()
            if self._lookup_spec(base) is not None:
                return Pointer(target=base, many=False)
            raise RegistrationError(
                "ambiguous-role",
                f"{spec.fqn}.{field_name}:{_fqn(base)} 未注册,不能当指针目标",
            )

        raise RegistrationError(
            "ambiguous-role",
            f"{spec.fqn}.{field_name}:注解 {base!r} 既不是属性也不是指针",
        )


# 字段发现


def _candidate_fields(cls: type, annotations: Mapping[str, Any]) -> list[tuple[str, Any, Any]]:
    """按定义顺序列出候选字段:`(名字, 注解, 默认值)`;默认值可能是 MISSING."""
    candidates: list[tuple[str, Any, Any]] = []
    if dataclasses.is_dataclass(cls):
        for spec_field in dataclasses.fields(cls):
            annotation = annotations.get(spec_field.name, spec_field.type)
            if _is_classvar(annotation):
                continue
            if spec_field.default is not dataclasses.MISSING:
                default = spec_field.default
            elif spec_field.default_factory is not dataclasses.MISSING:
                default = spec_field.default_factory
            else:
                default = MISSING
            candidates.append((spec_field.name, annotation, default))
        return candidates

    seen: set[str] = set()
    for name, value in vars(cls).items():
        if name.startswith("_") or name in seen:
            continue
        if _is_descriptor(value) or isinstance(value, type):
            continue
        annotation = annotations.get(name)
        if _is_classvar(annotation):
            continue
        candidates.append((name, annotation, value))
        seen.add(name)
    for name, annotation in annotations.items():
        if name.startswith("_") or name in seen:
            continue
        if _is_classvar(annotation):
            continue
        candidates.append((name, annotation, MISSING))
        seen.add(name)
    return candidates


def _is_classvar(annotation: Any) -> bool:
    return annotation is not None and typing.get_origin(annotation) is typing.ClassVar


def _is_descriptor(value: Any) -> bool:
    """方法 / staticmethod / classmethod / property 都不是数据字段."""
    return isinstance(value, (staticmethod, classmethod, property)) or inspect.isroutine(value)


def _strip_annotated(annotation: Any) -> Any:
    """拆掉 Annotated 外壳(元数据忽略);角色只由真实类型标注决定."""
    base = annotation
    while typing.get_origin(base) is typing.Annotated:
        base = typing.get_args(base)[0]
    return base


def _sequence_element(origin: Any, args: tuple[Any, ...]) -> type | None:
    if not args:
        return None
    if origin is tuple:
        if len(args) == 2 and args[1] is Ellipsis:
            return args[0] if isinstance(args[0], type) else None
        if len(args) == 1:
            return args[0] if isinstance(args[0], type) else None
        return None
    return args[0] if isinstance(args[0], type) else None


def _is_scalar_type(annotation: Any) -> bool:
    if annotation in _SCALAR_TYPES:
        return True
    return isinstance(annotation, type) and issubclass(annotation, (Enum, *_SCALAR_TYPES))


# 小工具


def _validate_label_field(spec: StructureSpec, fields: list[FieldSpec]) -> None:
    """`label` 写成字段名时,该字段必须存在且是属性.

    label 是展示文字,不能指向指针(指针是关系,不是值);写成可调用对象则不做字段校验.
    """
    if not isinstance(spec.label, str):
        return
    target = next((spec_field for spec_field in fields if spec_field.name == spec.label), None)
    if target is None:
        raise RegistrationError(
            "bad-label",
            f"{spec.fqn}.label = {spec.label!r},但没有这个字段",
        )
    if not isinstance(target.role, Attr):
        raise RegistrationError(
            "bad-label",
            f"{spec.fqn}.label = {spec.label!r} 指向的是 {type(target.role).__name__},label 只能是属性字段",
        )


def _fingerprint(fields: Iterable[FieldSpec]) -> str:
    signature = "|".join(f"{spec_field.name}:{_role_signature(spec_field.role)}" for spec_field in fields)
    return hashlib.sha256(signature.encode("utf-8")).hexdigest()[:16]


def _role_signature(role: Role) -> str:
    if isinstance(role, Pointer):
        return f"Pointer({_fqn(role.target)}:{role.many})"
    return type(role).__name__


def _role_describe(role: Role) -> str:
    if isinstance(role, Pointer):
        suffix = ", many=True" if role.many else ""
        return f"Pointer({role.target.__name__}{suffix})"
    return type(role).__name__


def _fqn(cls: type) -> str:
    return f"{getattr(cls, '__module__', '?')}.{getattr(cls, '__qualname__', getattr(cls, '__name__', '?'))}"


def _snake_case(name: str) -> str:
    """`RbtNode` -> `rbt_node`;只用于没显式给 name= 时的默认结构名."""
    first = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", name)
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", first).lower()


# 模块级默认表:只是便捷入口,库内部不依赖它
default_registry = Registry("default")

#: 默认表上的装饰器(`@structure` 等价于 `@default_registry.structure`)
structure = default_registry.structure
