// @ts-nocheck
import { AirBuildMode }    from "./AirBuildMode.js";
import { LineMode }         from "./LineMode.js";
import { WallMode }         from "./WallMode.js";
import { FloorMode }        from "./FloorMode.js";
import { DiagonalLineMode } from "./DiagonalLineMode.js";
import { DiagonalWallMode } from "./DiagonalWallMode.js";
import { SlopeFloorMode }   from "./SlopeFloorMode.js";
import { CubeMode }         from "./CubeMode.js";
import { CircleMode }       from "./CircleMode.js";
import { CylinderMode }     from "./CylinderMode.js";
import { SphereMode }       from "./SphereMode.js";
import { SemicircleMode }   from "./SemicircleMode.js";
import { ConeMode }         from "./ConeMode.js";
const REGISTRY = {
    disable:       null,
    air_build:     AirBuildMode,
    line:          LineMode,
    wall:          WallMode,
    floor:         FloorMode,
    diagonal_line: DiagonalLineMode,
    diagonal_wall: DiagonalWallMode,
    slope_floor:   SlopeFloorMode,
    cube:          CubeMode,
    circle:        CircleMode,
    cylinder:      CylinderMode,
    sphere:        SphereMode,
    semicircle:    SemicircleMode,
    cone:          ConeMode,
    copy_paste:    null,
};
export const MODE_LIST = [
    { id: "disable",       label: "Disable",       icon: "textures/effortless_building/disabled"       },
    { id: "air_build",     label: "Air Build",      icon: "textures/effortless_building/air_place"      },
    { id: "line",          label: "Line",           icon: "textures/effortless_building/line"           },
    { id: "wall",          label: "Wall",           icon: "textures/effortless_building/wall"           },
    { id: "floor",         label: "Floor",          icon: "textures/effortless_building/floor"          },
    { id: "diagonal_line", label: "Diagonal Line",  icon: "textures/effortless_building/diagonal_line"  },
    { id: "diagonal_wall", label: "Diagonal Wall",  icon: "textures/effortless_building/diagonal_wall"  },
    { id: "slope_floor",   label: "Slope Floor",    icon: "textures/effortless_building/slope_floor"    },
    { id: "cube",          label: "Cube",           icon: "textures/effortless_building/cube"           },
    { id: "circle",        label: "Circle",         icon: "textures/effortless_building/circle"         },
    { id: "cylinder",      label: "Cylinder",       icon: "textures/effortless_building/cylinder"       },
    { id: "sphere",        label: "Sphere",         icon: "textures/effortless_building/sphere"         },
    { id: "semicircle",    label: "Semicircle",     icon: "textures/effortless_building/semicircle"     },
    { id: "cone",          label: "Cone",           icon: "textures/effortless_building/cone"           },
    { id: "copy_paste",    label: "Copy / Paste",   icon: "textures/effortless_building/copy_paste"     },
];

export const SIMPLE_MODE_IDS = new Set(["disable", "line", "wall", "floor", "cube"]);

export function getModeHandler(modeId) {
    return REGISTRY[modeId] ?? null;
}
export const MODE_OPTIONS = {
    line:          [{ key: "curve", label: "Curve", choices: ["straight", "bezier"] }],
    diagonal_line: [{ key: "curve", label: "Curve", choices: ["straight", "bezier"] }],
    wall:          [{ key: "fill",  label: "Fill",  choices: ["filled", "hollow"] }],
    floor:         [{ key: "fill",  label: "Fill",  choices: ["filled", "hollow"] }],
    diagonal_wall: [{ key: "fill",  label: "Fill",  choices: ["filled", "hollow"] }],
    slope_floor:   [{ key: "fill",  label: "Fill",  choices: ["filled", "hollow"] }],
    cube:          [{ key: "fill",  label: "Fill",  choices: ["filled", "hollow", "skeleton"] }],
    circle:        [
        { key: "fill",  label: "Fill",  choices: ["filled", "hollow"] },
        { key: "shape", label: "Shape", choices: ["even", "uneven"] },
    ],
    cylinder:      [
        { key: "fill",  label: "Fill",  choices: ["filled", "hollow"] },
        { key: "shape", label: "Shape", choices: ["even", "uneven"] },
    ],
    sphere:        [{ key: "fill",  label: "Fill",  choices: ["filled", "hollow"] }],
    semicircle:    [
        { key: "orientation", label: "Shape", choices: ["horizontal", "arch", "dome"] },
        { key: "fill",        label: "Fill",  choices: ["filled", "hollow"] },
    ],
    cone:          [
        { key: "fill", label: "Fill", choices: ["filled", "hollow"] },
        { key: "axis", label: "Axis", choices: ["straight", "diagonal"] },
    ],

    copy_paste:    [],
};
