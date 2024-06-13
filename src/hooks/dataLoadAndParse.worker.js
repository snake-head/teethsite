// 用于页面开始时上颌牙/下颌牙的下载和数据解析, 全景图在另外一个worker
import { bracketDataNameOrderList } from "../static_config";
import xml2js from "xml2js";
import pako from "pako";
import {
    initBracketDataByLandMark,
    calculateRigidBodyTransMatrix,
    projectToAxis,
    estimateBracketBottomSlope,
} from "../utils/bracketFineTuneByTypedArray";
import {
    calculateTransMatrix,
} from "./userMatrixControl";
import { 
    calculateLineActorPointsAndDistance, 
    calculateLineActorPointsAndDistanceNew 
} from "./distanceLineControl";
import vtkMath, {
    add,
    angleBetweenVectors,
    cross,
    degreesFromRadians,
    multiplyScalar,
    normalize,
    subtract,
} from "@kitware/vtk.js/Common/Core/Math";
import vtkPlane from "@kitware/vtk.js/Common/DataModel/Plane";
import vtkCutter from "@kitware/vtk.js/Filters/Core/Cutter";
import vtkPolyData from "@kitware/vtk.js/Common/DataModel/PolyData";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkMatrixBuilder from "@kitware/vtk.js/Common/Core/MatrixBuilder";
import {
    setTokenHeader,
    setUserIdHeader,
    sendRequestWithToken,
} from "../utils/tokenRequest";
// import vtkRootHandleRepresentation from "../reDesignVtk/rootHandleWidget/RootHandleRepresentation";
// import rootHandleWidget from "../reDesignVtk/rootHandleWidget";
// import XML from '@kitware/vtk.js/IO/XML';

let token = "";
let userId = "";
let targetTeethType = "";
let windowLinkConfigClone = {};
let progressConfig = {
    0: {
        // 检测病人UID
        state: {
            message: "正在检测病人UID......",
            type: "wait",
            progress: "",
        },
    },
    1: {
        // 登录
        state: {
            message: "正在登录......",
            type: "wait",
            progress: "",
        },
    },
    2: {
        // 请求模型路径
        state: {
            message: "正在请求teethType模型路径......",
            type: "wait",
            progress: "",
        },
        modelPath: "",
        firstReadFlag: {
            Upper:0,
            Lower:0
        },
    },
    3: {
        // 下载牙齿模型
        state: {
            message: "正在下载teethType模型......",
            type: "wait",
            progress: "0.0%",
        },
        model: null,
    },
    4: {
        // 读取牙齿模型数据
        state: {
            message: "正在读取teethType模型下载数据......",
            type: "wait",
            progress: "",
        },
        data: null,
    },
    5: {
        // 解析CADO文件 + 读取所需托槽下载地址
        state: {
            message: "正在读取teethType所需托槽路径......",
            type: "wait",
            progress: "",
        },
        stlObj: null, // teeth
        xmlObj: undefined, // 信息文件
        bracketDataApi: "",
        bracketTypeName: "",
    },
    6: {
        // 下载托槽数据
        state: {
            message: "正在下载teethType托槽......",
            type: "wait",
            progress: "",
        },
        bracketData: "",
    },
    7: {
        // 解析托槽文件并存入stlObj
        state: {
            message: "正在解析teethType托槽......",
            type: "wait",
            progress: "0/28",
        },
        stlObj: [], // bracket
    },
    8: {
        // ViewerMain中操作, generateTeethActor('upper'), 生成对应actor
        state: {
            message: "正在制造teethType模型......",
            type: "wait",
            progress: "",
        },
        toothData: {},
        bracketData: {},
    },
    // 制造轴线actor
    9: {
        state: {
            message: "正在制造teethType轴线模型......",
            type: "wait",
            progress: "",
        },
    },
    // 制造牙根actor
    10: {
        state: {
            message: "正在制造teethType虚拟牙根模型......",
            type: "wait",
            progress: "",
        },
    },
    11: {
        state: {
            message: "完成！",
            type: "success",
            progress: "",
        },
    },
};
function modifyStateMessageByTeethType() {
    const typeText = targetTeethType === "upper" ? "上颌牙" : "下颌牙";
    Object.keys(progressConfig).forEach((step) => {
        progressConfig[step].state.message = progressConfig[
            step
        ].state.message.replace("teethType", typeText);
    });
}

/**
 * @description 构造牙齿旋转设置
 * @param xmlObj
 */
function generateTeethRotateSetting(xmlObj) {
    const teethData = {};
    xmlObj.PositionResult[0].Position.forEach((item) => {
        teethData[item.$.name.substring(1)] = {
            startPoint: [
                parseFloat(item.LongAxis[0].StartCoor[0].$.Coor0),
                parseFloat(item.LongAxis[0].StartCoor[0].$.Coor1),
                parseFloat(item.LongAxis[0].StartCoor[0].$.Coor2),
            ],
            locationPoint: [
                parseFloat(item.LongAxis[0].LocationCoor[0].$.Coor0),
                parseFloat(item.LongAxis[0].LocationCoor[0].$.Coor1),
                parseFloat(item.LongAxis[0].LocationCoor[0].$.Coor2),
            ],
            endPoint: [
                parseFloat(item.LongAxis[0].EndCoor[0].$.Coor0),
                parseFloat(item.LongAxis[0].EndCoor[0].$.Coor1),
                parseFloat(item.LongAxis[0].EndCoor[0].$.Coor2),
            ],
        };
    });
    // ------------------------------------------------------------------------
    // 计算z轴
    // ------------------------------------
    // z轴指向上下, 通过2个长轴点+1个长轴中点计算法向量
    // ------------------------------------------------------------------------
    // 获得一个大平面, 刚好在牙齿高度一半横切过去, 设置三个顶点为长轴中心点(L6/L7, R6/R7, L1R1线段中点)(优先6)
    // p1: L6/L7长轴中心点locationCoor
    // p2: R6/R7长轴中心点locationCoor
    // p3: L1,R1的长轴中心点取平均
    const p1 = teethData.L6
        ? teethData.L6.locationPoint
        : teethData.L7.locationPoint;
    const p2 = teethData.R6
        ? teethData.R6.locationPoint
        : teethData.R7.locationPoint;
    const p3 = [0, 0, 0];
    add(teethData.L1.locationPoint, teethData.R1.locationPoint, p3);
    multiplyScalar(p3, 0.5);

    // 计算平面p123的法向量, 即为zAxis
    const p12 = [0, 0, 0]; // p1->p2
    const p13 = [0, 0, 0]; // p1->p3
    subtract(p2, p1, p12);
    subtract(p3, p1, p13);
    const zNormal = [0, 0, 0];
    cross(p12, p13, zNormal);

    // 设置zAxis的正向指向牙尖, 与L1上endCoor->startCoor成锐角
    // 大于90度则反向180度
    const zPlusDirection = [0, 0, 0];
    subtract(teethData.L1.startPoint, teethData.L1.endPoint, zPlusDirection);
    if (degreesFromRadians(angleBetweenVectors(zPlusDirection, zNormal)) > 90) {
        multiplyScalar(zNormal, -1);
    }
    // 归一化
    normalize(zNormal);

    // ------------------------------------------------------------------------
    // 计算x轴
    // ------------------------------------
    // x轴指向左右, 由L7->R7
    // 但直接的计算将导致3个轴不互相垂直
    // 因此后续计算全部使用叉乘, 保证3个法向量相互垂直
    // 计算x首先计算出y轴, y轴一般定义为L7R7/L6R6->L1R1(优先7)
    // ------------------------------------------------------------------------
    const centerBehind = [0, 0, 0];
    add(
        teethData.L7 ? teethData.L7.locationPoint : teethData.L6.locationPoint,
        teethData.R7 ? teethData.R7.locationPoint : teethData.R6.locationPoint,
        centerBehind
    );
    multiplyScalar(centerBehind, 0.5);
    // centerFront=p3
    // 计算向前的y轴
    const frontNormal = [0, 0, 0];
    subtract(p3, centerBehind, frontNormal); // centreBehind->p3

    // 通过叉乘计算x轴
    const xNormal = [0, 0, 0];
    cross(frontNormal, zNormal, xNormal);

    // 设置xAxis的正向指向右侧, 与L7->R7(L6->R6)成锐角
    // 大于90度则反向180度
    if (degreesFromRadians(angleBetweenVectors(p12, xNormal)) > 90) {
        multiplyScalar(xNormal, -1);
    }
    // 归一化
    normalize(xNormal);

    // ------------------------------------------------------------------------
    // 计算y轴
    // ------------------------------------
    // y轴指向前后, 由L7R7/L6R6->L1R1(优先7)
    // 此处直接通过xNormal和zNormal的叉乘计算
    // ------------------------------------------------------------------------
    const yNormal = [0, 0, 0];
    cross(xNormal, zNormal, yNormal);

    // 设置yAxis的正向指向前方, 与frontNormal(L7R7/L6R6->L1R1)成锐角
    // 大于90度则反向180度
    if (degreesFromRadians(angleBetweenVectors(frontNormal, yNormal)) > 90) {
        multiplyScalar(yNormal, -1);
    }
    // 归一化
    normalize(yNormal);

    // ------------------------------------------------------------------------
    // 计算原点
    // ------------------------------------
    // 原点由centerBehind(L7R7/L6R6)决定, 但最好使得p3(L1R1)的x坐标为0
    // p3即为后续的fixP, 且为后续排牙的分界线/出发点, L和R以此坐标向左右延伸排牙
    // 且后续牙弓线的计算可能要求排牙左右对称, 即 1.牙弓线左右对称为偶函数 2.从y轴(x=0)开始排
    // ------------------------------------------------------------------------
    // centerBehind: L7,R7的长轴中心点
    // p1: L6/L7长轴中心点locationCoor
    // p2: R6/R7长轴中心点locationCoor
    // p3: L1,R1的长轴中心点
    const leftLocCoor = [];
    Object.keys(teethData).forEach((name) => {
        if (name.startsWith("L")) {
            leftLocCoor.push({
                name: name.substring(1),
                loc: teethData[name].locationPoint,
            });
        }
    });
    leftLocCoor.sort((a, b) => parseFloat(b.name) - parseFloat(a.name));
    // 计算左边最后面两颗牙的中点间距
    const subFinalWidth = [0, 0, 0];
    subtract(leftLocCoor[1].loc, leftLocCoor[0].loc, subFinalWidth);
    const dist = projectToAxis(yNormal, subFinalWidth);
    // 除2可能后移距离有点短
    const center = [
        centerBehind[0] - (dist / 1.5) * yNormal[0],
        centerBehind[1] - (dist / 1.5) * yNormal[1],
        centerBehind[2] - (dist / 1.5) * yNormal[2],
    ];

    // ------------------------------------------------------------------------
    // 计算坐标系
    // ------------------------------------------------------------------------
    return {
        rotCenter: [center[0], center[1], center[2]], // 牙齿旋转中心
        rotAxis: [xNormal[0], xNormal[1], xNormal[2]], // 牙齿旋转轴
    };
}

/**
 * @description 在原始数据中按面片存储,每个面片包括3个顶点, 然而不同面片间存在顶点复用的情况, 这些复用的顶点只需要存储一份
 * @param content
 */
function parseStl(content) {
    // const dview = new DataView(content, 0, 80 + 4) // 获得前84字节
    // const numTriangles = dview.getUint32(80, true) // 读取第80字节的一个4字节浮点数为面片数
    const nbFaces = (content.byteLength - 84) / 50; // 面片数也能通过如下方式计算

    // 头80个字节为头文件
    // Data
    const dataView = new DataView(content, 84); // 偏移84个字节
    const pointValues = new Float32Array(nbFaces * 9); // 1个面片=3个顶点=9个坐标(若顶点都不存入则存满)
    // const normalValues = new Float32Array(nbFaces * 3)
    const cellValues = new Uint32Array(nbFaces * 4); // 固定4个长度存放一个面片的三顶点索引
    // const cellDataValues = new Uint16Array(nbFaces)

    let cellIndexDict = {}; // 存储首个出现的顶点坐标(防止复用)
    let cellIndex = 0; // 顶点索引
    let pointDataOffset = 0; // 点数据偏移(1点3坐标)

    let faceIndexDict = {}; // 为每一个顶点存储其所属面片,如 1:[0,2]说明第1个顶点为第0与第2个面片的复用顶点
    // 用于构造单牙齿模型

    // 根据原始数据构造点集
    let cellOffset = 0;
    for (let faceIdx = 0; faceIdx < nbFaces; faceIdx++) {
        // 50字节 = 48个字节数据 + 2个面片属性
        // 48个字节数据 <=> 12个float32数据 <=> 4个三维坐标 = 1个法向量 + 3个顶点
        const offset = faceIdx * 50; // 一个面片50字节
        // 3个4字节为法向量(不读取)
        // normalValues[faceIdx * 3 + 0] = dataView.getFloat32(offset + 0, true)
        // normalValues[faceIdx * 3 + 1] = dataView.getFloat32(offset + 4, true)
        // normalValues[faceIdx * 3 + 2] = dataView.getFloat32(offset + 8, true)

        let point1 = [
            dataView.getFloat32(offset + 12, true),
            dataView.getFloat32(offset + 16, true),
            dataView.getFloat32(offset + 20, true),
        ];
        let point2 = [
            dataView.getFloat32(offset + 24, true),
            dataView.getFloat32(offset + 28, true),
            dataView.getFloat32(offset + 32, true),
        ];
        let point3 = [
            dataView.getFloat32(offset + 36, true),
            dataView.getFloat32(offset + 40, true),
            dataView.getFloat32(offset + 44, true),
        ];

        let point1Key = "[" + point1 + "]";
        let point2Key = "[" + point2 + "]";
        let point3Key = "[" + point3 + "]";

        if (cellIndexDict[point1Key] === undefined) {
            // 此处不能用!, 否则第0个顶点会重复存
            // 新点初始化
            faceIndexDict[cellIndex] = [];
            // 该点未录入pointValues时才进行存放
            cellIndexDict[point1Key] = cellIndex++;
            pointValues[pointDataOffset++] = point1[0];
            pointValues[pointDataOffset++] = point1[1];
            pointValues[pointDataOffset++] = point1[2];
        }
        if (cellIndexDict[point2Key] === undefined) {
            // 新点初始化
            faceIndexDict[cellIndex] = [];
            // 该点未录入pointValues时才进行存放
            cellIndexDict[point2Key] = cellIndex++;
            pointValues[pointDataOffset++] = point2[0];
            pointValues[pointDataOffset++] = point2[1];
            pointValues[pointDataOffset++] = point2[2];
        }
        if (cellIndexDict[point3Key] === undefined) {
            // 新点初始化
            faceIndexDict[cellIndex] = [];
            // 该点未录入pointValues时才进行存放
            cellIndexDict[point3Key] = cellIndex++;
            pointValues[pointDataOffset++] = point3[0];
            pointValues[pointDataOffset++] = point3[1];
            pointValues[pointDataOffset++] = point3[2];
        }

        // 当前是第几个面片？cellOffset / 4 = 0、1、2...
        let cellIdx = cellOffset / 4;
        // 记录面片组成之前先记录当前3个顶点从属于该面片
        faceIndexDict[cellIndexDict[point1Key]].push(cellIdx);
        faceIndexDict[cellIndexDict[point2Key]].push(cellIdx);
        faceIndexDict[cellIndexDict[point3Key]].push(cellIdx);

        // 组成面片的格式
        cellValues[cellOffset++] = 3; // 表明接下来3个点组成一个多边形
        // !如果是可复用顶点,则因为上述if语句未进入,
        // cellIndexDict[point1Key]会指向之前存在cellIndexDict中的那个顶点索引
        cellValues[cellOffset++] = cellIndexDict[point1Key]; // 顶点1索引
        cellValues[cellOffset++] = cellIndexDict[point2Key]; // 顶点2索引
        cellValues[cellOffset++] = cellIndexDict[point3Key]; // 顶点3索引

        // 最后2字节描述面片属性
        // cellDataValues[faceIdx] = dataView.getUint16(offset + 48, true)
    }

    return {
        faceIndexDict,
        pointValues: pointValues.slice(0, pointDataOffset),
        cellValues,
    };
}
/**
 * @description 根据面片索引建立分割模型的polyData
 * @param teethPointValues 全牙点集
 * @param teethCellValues 全牙面片
 * @param faceIds Array 其中哪些面片属于分割模型
 */
function generateSegmentPolyData(teethPointValues, teethCellValues, faceIds) {
    const nbFaces = faceIds.length;
    const pointValues = new Float32Array(nbFaces * 9); // 1个面片=3个顶点=9个坐标(若顶点都不存入则存满)
    const cellValues = new Uint32Array(nbFaces * 4); // 固定4个长度存放一个面片的三顶点索引
    let pointDataOffset = 0; // 点数据偏移(1点3坐标)
    let cellDataOffset = 0; // cell数据偏移(1面片4坐标)
    // vertDict: {4055: 0, 4058:1}->原模型第4055个顶点将作为该模型的第0个顶点 ... 与cellIndexDict的key稍有差别
    // 这样写避免不必要的读取getPoint()
    let vertDict = {};
    let vertOffset = 0;
    for (let i = 0; i < nbFaces; i++) {
        let faceId = faceIds[i];
        // cellData中每4位存放一组面片顶点索引
        let cellOffset = faceId * 4;
        let vert1Index = teethCellValues[cellOffset + 1]; // 顶点1索引
        let vert2Index = teethCellValues[cellOffset + 2]; // 顶点2索引
        let vert3Index = teethCellValues[cellOffset + 3]; // 顶点3索引
        // 如果vertDict中没有该顶点记录,则说明是新的顶点,此时记录其对应关系, 同时存入顶点数据
        if (vertDict[vert1Index] === undefined) {
            vertDict[vert1Index] = vertOffset++;
            let pointOffset = vert1Index * 3;
            pointValues[pointDataOffset++] = teethPointValues[pointOffset];
            pointValues[pointDataOffset++] = teethPointValues[pointOffset + 1];
            pointValues[pointDataOffset++] = teethPointValues[pointOffset + 2];
        }
        if (vertDict[vert2Index] === undefined) {
            vertDict[vert2Index] = vertOffset++;
            let pointOffset = vert2Index * 3;
            pointValues[pointDataOffset++] = teethPointValues[pointOffset];
            pointValues[pointDataOffset++] = teethPointValues[pointOffset + 1];
            pointValues[pointDataOffset++] = teethPointValues[pointOffset + 2];
        }
        if (vertDict[vert3Index] === undefined) {
            vertDict[vert3Index] = vertOffset++;
            let pointOffset = vert3Index * 3;
            pointValues[pointDataOffset++] = teethPointValues[pointOffset];
            pointValues[pointDataOffset++] = teethPointValues[pointOffset + 1];
            pointValues[pointDataOffset++] = teethPointValues[pointOffset + 2];
        }
        // 记录cell
        // 组成面片的格式
        cellValues[cellDataOffset++] = 3; // 表明接下来3个点组成一个多边形
        // !如果是可复用顶点,则因为上述if语句未进入,
        // cellIndexDict[point1Key]会指向之前存在cellIndexDict中的那个顶点索引
        cellValues[cellDataOffset++] = vertDict[vert1Index]; // 顶点1索引
        cellValues[cellDataOffset++] = vertDict[vert2Index]; // 顶点2索引
        cellValues[cellDataOffset++] = vertDict[vert3Index]; // 顶点3索引
    }
    return { pointValues: pointValues.slice(0, pointDataOffset), cellValues };
}
/**
 * @description 建立单牙齿+牙龈的分割模型polyData
 * @param teethPointValues 全牙点集
 * @param teethCellValues 全牙面片
 * @param faceIndexDict 面片从属关系
 * @param toothSegmentData 牙齿分割点集数据 xmlObj[teethType].SegementResult[0].Tooth
 */
function generateSegmentData(
    teethPointValues,
    teethCellValues,
    faceIndexDict,
    toothSegmentData
) {
    // 遍历pointsId:[4001, 96400, 80555, ...]
    // ->faceVertCnt = {} faceIndexDict[4001]->[5,80,999]->undefined则初始化为1, 存在则+1
    // hasInclude初始化 = {4001:false, 96400:false, 80555:false, ...}
    let toothRowData = toothSegmentData.map((item) => {
        const toothName = item.$.name;
        const vertIds = item.Pids[0]
            .trim()
            .split(" ")
            .map((i) => parseInt(i));

        // 遍历vertIds:[4001, 96400, 80555, ...]
        // ->faceVertCnt = {} faceIndexDict[4001]->[5,80,999]->undefined则初始化为1, 存在则+1
        // hasInclude初始化 = {4001:false, 96400:false, 80555:false, ...}
        let faceVertCnt = {};
        let faceIds = [];

        vertIds.forEach((vertId) => {
            // 读取该顶点从属于哪些面片
            let vertToFaceId = faceIndexDict[vertId];
            vertToFaceId.forEach((faceId) => {
                // 为每个面片计数
                if (faceVertCnt[faceId] !== undefined) {
                    faceVertCnt[faceId]++;
                    // 当某面片计数达到3时(不可能大于3), 说明该面片的3个顶点全部存在于该点集中
                    // 即认为 3顶点-->组成该面片-->组成该单牙齿模型
                    if (faceVertCnt[faceId] >= 3) {
                        faceIds.push(faceId);
                    }
                } else {
                    faceVertCnt[faceId] = 1;
                }
            });
        });
        const { pointValues, cellValues } = generateSegmentPolyData(
            teethPointValues,
            teethCellValues,
            faceIds
        );

        return {
            toothName, // 单牙齿名称
            faceIds,
            pointValues,
            cellValues,
        };
    });

    // 牙齿总面片, 减去12个牙齿的组成面片, 剩下的就是牙龈的面片
    // allToothFaceId中为所有单牙齿的面片
    const allToothFaceId = toothRowData.reduce((pre, cur) => {
        return pre.concat(cur.faceIds);
    }, []);
    allToothFaceId.sort((a, b) => a - b);
    // 全牙面片组成
    const numFaces = teethCellValues.length / 4;
    const gingivaFaces = [];
    let toothFaceOffset = 0;
    for (let i = 0; i < numFaces; i++) {
        if (i === allToothFaceId[toothFaceOffset]) {
            // 跳过属于牙齿的面片索引
            toothFaceOffset++;
            continue;
        }
        // 剩下的就是牙龈的索引
        gingivaFaces.push(i);
    }
    const { pointValues, cellValues } = generateSegmentPolyData(
        teethPointValues,
        teethCellValues,
        gingivaFaces
    );

    toothRowData.push({
        toothName: "gingiva", // 单牙齿名称,
        pointValues,
        cellValues,
    });

    return toothRowData.map((item) => {
        // 去掉faceIds
        const { toothName, pointValues, cellValues } = item;
        return {
            toothName, // 单牙齿名称 / 牙龈
            pointValues,
            cellValues,
        };
    });
}

/**
 * @description 计算两个向量的单位法向量,计算得到的单位法向量同时垂直于两个向量
 * @param a 向量1
 * @param b 向量2
 */
function calculateN(a, b) {
    let x = a[1] * b[2] - a[2] * b[1];
    let y = a[2] * b[0] - a[0] * b[2];
    let z = a[0] * b[1] - a[1] * b[0];
    let length = Math.sqrt(x ** 2 + y ** 2 + z ** 2);
    return [x / length, y / length, z / length];
    // return [x, y, z]
}
function generateBracketObjFromStl(stlData, xmlData) {
    let { pointValues, cellValues } = parseStl(stlData);

    // 托槽位置中心点
    let centerPoint = xmlData.TcPosition[0].TcCenterCoor[0].$;
    let center = [
        parseFloat(centerPoint.Coor0),
        parseFloat(centerPoint.Coor1),
        parseFloat(centerPoint.Coor2),
    ];
    // 托槽[上下]法向量1
    let tcCenter = xmlData.TcPosition[0].TcCenterAxis[0].$;
    let yNormal = [
        parseFloat(tcCenter.Coor0),
        parseFloat(tcCenter.Coor1),
        parseFloat(tcCenter.Coor2),
    ];
    // 托槽[前后]法向量(屏幕深度方向)
    let tcNormal = xmlData.TcPosition[0].TcNormal[0].$;
    let zNormal = [
        parseFloat(tcNormal.Coor0),
        parseFloat(tcNormal.Coor1),
        parseFloat(tcNormal.Coor2),
    ];
    // 托槽[左右]法向量
    let xNormal = calculateN(yNormal, zNormal);
    let centerRotate = center;
    let yNormalRotate = yNormal;
    let zNormalRotate = zNormal;
    let xNormalRotate = xNormal;
    if(xmlData.TcPosition[0].TcCenterCoorRotate){
        // 托槽位置中心点
        let centerPointRotate = xmlData.TcPosition[0].TcCenterCoorRotate[0];
        centerRotate = [
            parseFloat(centerPointRotate.Coor0),
            parseFloat(centerPointRotate.Coor1),
            parseFloat(centerPointRotate.Coor2),
        ];
        // 托槽[上下]法向量1
        let tcCenterRotate = xmlData.TcPosition[0].TcCenterAxisRotate[0];
        yNormalRotate = [
            parseFloat(tcCenterRotate.Coor0),
            parseFloat(tcCenterRotate.Coor1),
            parseFloat(tcCenterRotate.Coor2),
        ];
        // 托槽[前后]法向量(屏幕深度方向)
        let tcNormalRotate = xmlData.TcPosition[0].TcNormalRotate[0];
        zNormalRotate = [
            parseFloat(tcNormalRotate.Coor0),
            parseFloat(tcNormalRotate.Coor1),
            parseFloat(tcNormalRotate.Coor2),
        ];
        // 托槽[左右]法向量
        xNormalRotate = calculateN(yNormalRotate, zNormalRotate);
    }
    
    // 保存托槽位置和3轴法向量
    return {
        pointValues,
        cellValues,
        center,
        xNormal,
        yNormal,
        zNormal,
        centerRotate,
        xNormalRotate,
        yNormalRotate,
        zNormalRotate,
    };
}

/**
 * @description 决定镜头正方向依据哪个托槽来,
 * 优先级依据小的来, 如UL1 > UL2,
 * 如果同级则L>R, 如UL1 > UR1
 * @param allBracketName ['UL1', 'UL2', ....]
 */
function findCameraBaseName(allBracketName) {
    if (allBracketName.length === 0) {
        return "Default";
    }
    let selectBracketName = allBracketName[0];
    for (let bracketName of allBracketName) {
        if (selectBracketName[2] > bracketName[2]) {
            selectBracketName = bracketName;
        } else if (
            selectBracketName[2] === bracketName[2] &&
            selectBracketName[1] === "R" &&
            bracketName[1] === "L"
        ) {
            selectBracketName = bracketName;
        }
    }
    return selectBracketName;
}
/**
 * @description 为托槽解析stl数据并制造托槽actor,mapper等属性, 解析xml文件并制造normal,center等数据
 * 返回值中的各points需保存至 segPoints.bracket[bracketName]
 * 返回值中的各actor需设置颜色 actor.getProperty().setColor(...colorConfig.teeth)
 * 返回值中的mainCameraConfigs需保存至 mainCameraConfigs[teethType]
 * @param bracketStlData stlObj.bracket[teethType]
 * @param needBracketNameList xmlObj[teethType].PositionResult[0].Position
 */
function generateBracketData(bracketStlData, needBracketNameList) {
    let cameraConfigs = {};
    let stlDataList = [];
    let cameraBaseBracket = findCameraBaseName(
        bracketStlData.map((item) => item.posName)
    );
    if (cameraBaseBracket === "Default") {
        cameraConfigs = {
            base: "UL9", // 用于后续比较优先级, 直接到最小优先级7以下
            viewUp: [0, 0, 1], // 镜头[上]方向
            viewFront: [1, 0, 0], // 镜头[前]方向
            viewLeft: [0, 1, 0], // 镜头[左]方向
            viewRight: [0, -1, 0], // 镜头[右]方向
        };
    }
    bracketStlData.map((item) => {
        const bracketName = item.posName;
        let stlData = item.stl;
        let posData = needBracketNameList.filter(
            (item) => item.$.name === bracketName
        )[0];

        let {
            pointValues,
            cellValues,
            center,
            xNormal,
            yNormal,
            zNormal,
            centerRotate,
            xNormalRotate,
            yNormalRotate,
            zNormalRotate,
        } = generateBracketObjFromStl(stlData, posData);

        let position = {
            center, // 托槽中心位置
            xNormal, // 左右法向量
            yNormal, // 上下法向量
            zNormal, // 前后法向量(屏幕深度方向)
        };
        let positionRotate = {
            centerRotate,
            xNormalRotate,
            yNormalRotate,
            zNormalRotate,
        };
        // 保存当前模型的向上方向
        if (bracketName === cameraBaseBracket) {
            if (bracketName.startsWith("U")) {
                // 上颌牙数据
                cameraConfigs = {
                    base: cameraBaseBracket,
                    viewUp: [-yNormal[0], -yNormal[1], -yNormal[2]], // 镜头[上]方向
                    viewFront: [zNormal[0], zNormal[1], zNormal[2]], // 镜头[前]方向
                    viewLeft: [xNormal[0], xNormal[1], xNormal[2]], // 镜头[左]方向
                    viewRight: [-xNormal[0], -xNormal[1], -xNormal[2]], // 镜头[右]方向
                };
            } else {
                // 下颌牙数据
                cameraConfigs = {
                    base: cameraBaseBracket,
                    viewUp: [yNormal[0], yNormal[1], yNormal[2]], // 镜头[上]方向
                    viewFront: [zNormal[0], zNormal[1], zNormal[2]], // 镜头[前]方向
                    viewLeft: [-xNormal[0], -xNormal[1], -xNormal[2]], // 镜头[左]方向
                    viewRight: [xNormal[0], xNormal[1], xNormal[2]], // 镜头[右]方向
                };
            }
        }

        // 保存托槽actor、模型坐标系三轴方向并添加到renderer
        let direction = {
            up: [xNormal[0], xNormal[1], xNormal[2]], // 左右
            left: [-yNormal[0], -yNormal[1], -yNormal[2]], // 上下
            deep: [zNormal[0], zNormal[1], zNormal[2]], // 前后
        };

        stlDataList.push({
            name: bracketName,
            direction,
            position,
            positionRotate,
            pointValues,
            cellValues,
        });
    });

    return {
        stlDataList,
        cameraConfigs,
    };
}

/**
 * @description 根据两个长轴端点和zNormal计算出一系列平面, 该平面用于切割牙齿做出对应的坐标轴
 * 坐标轴来源：一个个垂直或平行的网格状相交平面与牙齿点集的交集
 * 平面决定于一个法向量+一个平面上的点
 * 坐标轴的一个法向量分别为 startPoint->endPoint
 * 另一个法向量为startPoint->endPoint与托槽zNormal的叉乘方向
 * 平面上的点需要间隔axisDist均匀选取
 * @param startPoint 牙尖端点
 * @param endPoint 牙底端点
 * @param zNormal 托槽z法向量(指向托槽远离牙齿方向)
 * @param pointValues 牙齿点集 typedArray
 * @param cellValues 牙齿面片 typedArray
 * @param axisDist 选取点间距, 即平面间距, 即坐标轴间距
 */
function getCutActorList(
    startPoint,
    endPoint,
    zNormal,
    pointValues,
    cellValues,
    axisDist
) {
    // ----------------------------------
    // 计算两个法向量 normal1和normal2
    // ----------------------------------
    const normal1 = [
        endPoint[0] - startPoint[0],
        endPoint[1] - startPoint[1],
        endPoint[2] - startPoint[2],
    ]; // 由startPoint指向endPoint
    vtkMath.normalize(normal1); // 归一化模值
    const normal2 = [0, 0, 0];
    vtkMath.cross(zNormal, normal1, normal2);
    vtkMath.normalize(normal2); // 归一化模值
    // ----------------------------------
    // 计算每个平面上的点(均匀选取)
    // ----------------------------------
    // normal1Min, normal1Max, normal2Min, normal2Max
    const toothProjectionBound = [Infinity, -Infinity, Infinity, -Infinity];
    // 计算牙齿投影到normal1和normal2上的最大最小距离
    const sizePoints = pointValues.length;
    for (let idx = 0; idx < sizePoints; idx += 3) {
        const point = [
            pointValues[idx],
            pointValues[idx + 1],
            pointValues[idx + 2],
        ];
        const proj1 = projectToAxis(normal1, point);
        const proj2 = projectToAxis(normal2, point);
        // 更新边界
        toothProjectionBound[0] = Math.min(toothProjectionBound[0], proj1);
        toothProjectionBound[1] = Math.max(toothProjectionBound[1], proj1);
        toothProjectionBound[2] = Math.min(toothProjectionBound[2], proj2);
        toothProjectionBound[3] = Math.max(toothProjectionBound[3], proj2);
    }
    // 计算牙齿在normal1和normal2坐标系下的边界长度
    // const toothNormal1Dist = toothProjectionBound[1] - toothProjectionBound[0]
    // const toothNormal2Dist = toothProjectionBound[3] - toothProjectionBound[2]
    // 计算各能取多少点
    // const numNormal1OriginP = Math.floor(toothNormal1Dist / axisDist) + 1
    // const numNormal2OriginP = Math.floor(toothNormal2Dist / axisDist) + 1

    // 取点时需要两种平面都要经过startPoint
    // 计算startPoint的两个投影坐标
    const proj1OfStartP = projectToAxis(normal1, startPoint);
    const proj2OfStartP = projectToAxis(normal2, startPoint);
    // 通过计算得知应该如何分段
    const originOfNormal1Start =
        proj1OfStartP -
        axisDist *
            Math.floor((proj1OfStartP - toothProjectionBound[0]) / axisDist);
    const originOfNormal1End =
        proj1OfStartP +
        axisDist *
            Math.floor((toothProjectionBound[1] - proj1OfStartP) / axisDist);
    const originOfNormal1NumStep =
        (originOfNormal1End - originOfNormal1Start) / axisDist + 1;

    const originOfNormal2Start =
        proj2OfStartP -
        axisDist *
            Math.floor((proj2OfStartP - toothProjectionBound[2]) / axisDist);
    const originOfNormal2End =
        proj2OfStartP +
        axisDist *
            Math.floor((toothProjectionBound[3] - proj2OfStartP) / axisDist);
    const originOfNormal2NumStep =
        (originOfNormal2End - originOfNormal2Start) / axisDist + 1;

    // 取法向量为normal1的平面点(横向平面)
    const originOfNormal1 = [];
    for (let i = 0; i < originOfNormal1NumStep; i++) {
        const projectionDist = originOfNormal1Start + i * axisDist; // 从min到max
        originOfNormal1.push([
            projectionDist * normal1[0],
            projectionDist * normal1[1],
            projectionDist * normal1[2],
        ]);
    }
    // 取法向量为normal2的平面点(纵向平面)
    const originOfNormal2 = [];
    let longAxisIdx = -1; // 记录经过startP和endP那个平面索引, 这个平面需要加粗
    for (let i = 0; i < originOfNormal2NumStep; i++) {
        const projectionDist = originOfNormal2Start + i * axisDist; // 从min到max
        originOfNormal2.push([
            projectionDist * normal2[0],
            projectionDist * normal2[1],
            projectionDist * normal2[2],
        ]);
        if (proj2OfStartP === projectionDist) {
            longAxisIdx = i;
        }
    }
    // ----------------------------------
    // 构造平面, 构造切割
    // ----------------------------------
    const toothPolyData = vtkPolyData.newInstance();
    toothPolyData.getPoints().setData(pointValues);
    toothPolyData.getPolys().setData(cellValues);
    const cutterActorList = [];
    // 法向量：normal1
    // 点：originOfNormal1
    originOfNormal1.forEach((origin) => {
        const plane = vtkPlane.newInstance();
        plane.setOrigin(...origin);
        plane.setNormal(...normal1);

        const cutter = vtkCutter.newInstance();
        cutter.setCutFunction(plane); // 使用plane切割
        cutter.setInputData(toothPolyData); // 切割对象为牙齿polyData
        cutterActorList.push({
            pointValues: cutter
                .getOutputData()
                .getPoints()
                .getData(),
            lineValues: cutter
                .getOutputData()
                .getLines()
                .getData(),
            color: [0, 0, 1],
            isLongAxis: false,
        });
    });
    originOfNormal2.forEach((origin, idx) => {
        const plane = vtkPlane.newInstance();
        plane.setOrigin(...origin);
        plane.setNormal(...normal2);
        const cutter = vtkCutter.newInstance();
        cutter.setCutFunction(plane); // 使用plane切割
        cutter.setInputData(toothPolyData); // 切割对象为牙齿polyData
        cutterActorList.push({
            pointValues: cutter
                .getOutputData()
                .getPoints()
                .getData(),
            lineValues: cutter
                .getOutputData()
                .getLines()
                .getData(),
            color: [1, 0, 0],
            isLongAxis: idx === longAxisIdx,
        });
    });
    return cutterActorList;
}
/**
 * @description: 将两个polydata拼接到一起
 * @param {*} pointsData1
 * @param {*} polysData1
 * @param {*} pointsData2
 * @param {*} polysData2
 * @return {*} 拼接好的points和polys
 * @author: ZhuYichen
 */
function combinePointDataAndPolysData(pointsData1, polysData1, pointsData2, polysData2) {
    // 合并两组点数据
    const combinedPointsData = new Float32Array(pointsData1.length + pointsData2.length);
    combinedPointsData.set(pointsData1, 0);
    combinedPointsData.set(pointsData2, pointsData1.length);
  
    // 由于多边形的索引需要更新，我们需要将第二组多边形数据中的索引偏移
    const offset = pointsData1.length / 3; // 每个点有3个坐标
    const offsetPolysData2 = new Uint32Array(polysData2.length);
    for (let i = 0; i < polysData2.length; i++) {
      offsetPolysData2[i] = polysData2[i] + offset;
    }
  
    // 合并两组多边形数据
    const combinedPolysData = new Uint32Array(polysData1.length + offsetPolysData2.length);
    combinedPolysData.set(polysData1, 0);
    combinedPolysData.set(offsetPolysData2, polysData1.length);
  
    return { combinedPointsData, combinedPolysData };
  }

/**
 * @description 需要计算沿长轴平行方向上托槽中心与startPoint的投影距离之差, 并构建相应Line作为回顾
 * 这个距离实际上等同于两个平行平面的距离, 两个平面的法向量都是 endPoint-startPoint, 而origin分别为托槽中心和startPoint
 *
 * LineActor由3个线段组成, 4个顶点组成, 其中的2个顶点为当前托槽中心center与startPoint,
 * 另外两个顶点xp、xp2需要漂浮在托槽上方且组成的直线与startPoint->endPoint平行
 * 计算：
 * 构造平面1过点startPoint, 法向量=startPoint->endPoint,
 * 构造平面2过点center, 法向量=startPoint->endPoint,
 * 将center沿zNormal方向移动1.5个距离得到centerFloat, 使centerFloat在托槽上方,
 * 然后将centerFloat分别投射到平面1、平面2上得到xp、xp2, 最终距离等于xp与xp2的距离
 *
 * @param center 托槽中心
 * @param startPoint 牙尖点
 * @param endPoint 牙底点
 * @param zNormal 托槽法向量
 * @param floatDist 直线沿zNormal方向上浮距离
 * @param pointValues 牙齿点数据
 * @param cellValues 牙齿面片数据
 */
function initDistanceLine(center, startPoint, endPoint, zNormal, xNormal, floatDist, pointValues, cellValues) {
    // 2023.11.02更新：距离线计算不再以牙尖小球为终点，而是与牙齿最尖端相切
    // const { pointValues, distance } = calculateLineActorPointsAndDistance(
    //     center,
    //     startPoint,
    //     endPoint,
    //     zNormal,
    //     floatDist
    // );
    const { linePointValues, distance, circlePoints, circlePolys } = calculateLineActorPointsAndDistanceNew(
        center,
        startPoint,
        endPoint,
        zNormal,
        xNormal,
        floatDist,
        pointValues,
        cellValues,
    );
    const lineCellValues = new Uint32Array([
        2,
        1,
        2, // startPoint->startPlaneProj
        2,
        2,
        3, // startPlaneProj->centerPlaneProj
        2,
        3,
        4, // centerPlaneProj->center
    ]);
    // 为了方便，这里将距离线和垂面的polydata做了拼接
    // TODO:将两部分分开返回
    const {combinedPointsData, combinedPolysData} = combinePointDataAndPolysData(linePointValues, lineCellValues, circlePoints, circlePolys)
    return { 
        pointValues:combinedPointsData, 
        cellValues:combinedPolysData, 
        distance,
    };
}

// step0(从地址中检测patientUID)+step1(登录身份认证)需要在主线程中完成

/**
 * @description step2: 请求模型路径
 */
function queryModelPath(configApi) {
    const retData = {
        step: 2, // 当前正在执行第2步
        toNext: false, // 是否继续执行下一步
    };
    const stepConfig = progressConfig["2"];
    sendRequestWithToken({
        method: "GET",
        url: encodeURI(configApi),
    }).then(
        (resp) => {
            if (resp.data.data && !resp.data.data.includes("NOT FOUND")) {
                // 去掉斜杠
                stepConfig.modelPath =
                    windowLinkConfigClone.modelDataQueryApi + resp.data.data;
                retData.toNext = true;
            } else {
                stepConfig.state.message = "未检测到牙齿模型！";
                stepConfig.state.type = "deactive";
            }
            // flagFirstRead用于判断是否是第一次读入数据，若是第一次，则需要进行托槽和牙齿的碰撞检测
            // 2022/12/12更新：不再采用从服务器读取flag字段，而是在xml文件中添加该字段
            // if (resp.data.flag) {
            //     stepConfig.firstReadFlag = resp.data.flag;
            // }
            self.postMessage({ ...retData, ...stepConfig.state }); // 返回信息给主线程
        },
        (error) => {
            stepConfig.state.message = "未检测到牙齿模型！";
            stepConfig.state.type = "deactive";
            self.postMessage({ ...retData, ...stepConfig.state }); // 返回信息给主线程
        }
    );
}

/**
 * @description step3: 下载牙齿模型
 */
function downloadModel() {
    const retData = {
        step: 3, // 当前正在执行第3步
        toNext: false, // 是否继续执行下一步
    };
    const { modelPath } = progressConfig["2"];
    const stepConfig = progressConfig["3"];
    const dlConfig = {
        responseType: "blob",
        onDownloadProgress: (e) => {
            stepConfig.state.progress =
                Math.ceil((e.loaded / e.total) * 100) + "%";
            retData.toNext = false;
            self.postMessage({ ...retData, ...stepConfig.state }); // 返回下载进度
        },
        headers: {
            "Cache-Control": "no-cache",
        },
    };
    sendRequestWithToken({
        method: "GET",
        url: encodeURI(modelPath),
        ...dlConfig,
    }).then(
        (resp) => {
            stepConfig.model = new Blob([resp.data], {
                type: "application/octet-stream",
            });
            retData.toNext = true;
            self.postMessage({ ...retData, ...stepConfig.state });
        },
        (error) => {
            stepConfig.state.message = "未检测到牙齿模型！";
            stepConfig.state.progress = "";
            stepConfig.state.type = "deactive";
            self.postMessage({ ...retData, ...stepConfig.state });
        }
    );
}

/**
 * @description step4: 解析下载模型, 分割stl和xml, 其中xml进一步解析为Object
 */
function handleModel() {
    const retData = {
        step: 4, // 当前正在执行第4步
        toNext: false, // 是否继续执行下一步
    };
    const { model } = progressConfig["3"];
    const stepConfig = progressConfig["4"];
    const fileReader = new FileReader();
    fileReader.readAsArrayBuffer(model);
    fileReader.onload = () => {
        const cadoFile = fileReader.result;
        const dv = new DataView(cadoFile);
        const stlLength = dv.getUint32(80, true) * 50 + 80 + 4;
        if (stlLength === 84) {
            stepConfig.state.message = "牙齿数据不存在！";
            stepConfig.state.type = "error";
            self.postMessage({ ...retData, ...stepConfig.state });
        } else {
            const stl = cadoFile.slice(0, stlLength); // stl part
            const xmlBlobFile = new Blob([cadoFile.slice(stlLength)]);
            const xmlReader = new FileReader();
            xmlReader.readAsText(xmlBlobFile);
            xmlReader.onload = () => {
                let xml = xmlReader.result;
                stepConfig.data = {
                    stl,
                    xml, // string
                };
                retData.toNext = true;
                self.postMessage({ ...retData, ...stepConfig.state });
            };
        }
    };
}

/**
 * @description step5: 根据上述解析生成stlObj, 解析xml文件生成xmlObj, 并从xml中读取所需托槽相关信息, 获取托槽下载地址
 */
function parseCADO() {
    const retData = {
        step: 5, // 当前正在执行第5步
        toNext: false, // 是否继续执行下一步
        stlObj: null, // 这一步需要返回stlObj.teeth[teethType]
        xmlObj: null, // 这一步需要返回xmlObj[teethType]
        rotateSetting: { rotCenter: [0, 0, 0], rotAxis: [0, 0, 0] },
        targetBracketUID: '',
    };
    // 解析文件, 生成对应的stl与xml信息,存入stlObj与xmlObj, 用于后续解析成polyData并渲染在页面中
    // 其中的stl文件包含牙齿数据, xml文件包括牙齿托槽的各项信息

    const { stl, xml } = progressConfig["4"].data;
    const stepConfig = progressConfig["5"];
    const firstReadFlag = progressConfig["2"].firstReadFlag;
    // 保存上/下颌牙牙齿模型
    stepConfig.stlObj = stl;
    // 解析xml并转换为obj, 存储到 xmlObj
    xml2js.parseStringPromise(xml).then(
        (result) => {
            // 保存上/下颌牙牙齿模型信息
            stepConfig.xmlObj = result.CADOProject;
            const teethType = stepConfig.xmlObj.OriginalModel[0].$.jaw;
            if (stepConfig.xmlObj.ProcessState[0].$.collisionState){
                firstReadFlag[teethType] = parseInt(stepConfig.xmlObj.ProcessState[0].$.collisionState)
            }
            // 从xml中的positionResult中找到托槽名字
            let targetBracketUID =
                stepConfig.xmlObj.PositionResult[0].$.BracketType;
            retData.targetBracketUID = targetBracketUID;
            // console.log(windowLinkConfigClone.bracketTypeInfoQueryApi)
            sendRequestWithToken({
                method: "GET",
                url:
                    windowLinkConfigClone.bracketTypeInfoQueryApi +
                    "?ClientType=UserClient",
            }).then(
                (res) => {
                    res.data.data.forEach((item)=>{
                    })
                    let targetBracketData = res.data.data.filter(
                        (item) => item.BracketUID === targetBracketUID
                        // (item) => item.BracketUID === 'd7efced3115b4daba0758b1a7a302cc0'
                    );
                    if (targetBracketData.length > 0) {
                        // 获取对应托槽文件并解析出其中28个牙齿托槽文件(<14个有效)
                        stepConfig.bracketDataApi =
                            windowLinkConfigClone.bracketTypeFileQueryApi +
                            "?DownloadBracketTypeId=" +
                            targetBracketData[0].MultiBracketId;
                        stepConfig.bracketTypeName =
                            targetBracketData[0].bracketTypeName;
                        retData.toNext = true;
                        retData.stlObj = stepConfig.stlObj;
                        retData.xmlObj = stepConfig.xmlObj;
                        // console.log(JSON.stringify(retData.xmlObj.teethRootData))
                        retData.arrangeData = parseArrangeData(retData.xmlObj);
                        // retData.rotateSetting = generateTeethRotateSetting(stepConfig.xmlObj)
                        self.postMessage({ ...retData, ...stepConfig.state });
                    } else {
                        stepConfig.state.message =
                            "服务器中不存在所需托槽类型！";
                        stepConfig.state.type = "error";
                        self.postMessage({ ...retData, ...stepConfig.state });
                    }
                },
                (error) => {
                    stepConfig.state.message = "无法读取服务器托槽信息！";
                    stepConfig.state.type = "error";
                    self.postMessage({ ...retData, ...stepConfig.state });
                }
            );
        },
        (error) => {
            stepConfig.state.message = "文件解析失败！";
            stepConfig.state.type = "error";
            self.postMessage({ ...retData, ...stepConfig.state });
        }
    );
}

/**
 * @description 解析排牙数据, 解析出来和step5数据一起返回主线程, 然后主线程保存到vuex中
 * 在全部加载完成后, 如果检测一下这些数据, 如果齐全的话直接进入排牙界面,
 * 可以做一个getter, if getter -> 开启排牙模式 -> 不排牙直接进去(新函数)
 */
function parseArrangeData(xmlObj) {
    let ret = {};
    if (xmlObj.dentalArch) {
        let dentalArch = xmlObj.dentalArch[0];
        // 读arrangeMatrix
        if (dentalArch.arrange) {
            ret.arrangeMatrix = {};
            for (let { $, transform } of dentalArch.arrange) {
                let index = 0;
                let cxyz = [];
                while (transform[0][`transform${index}`]) {
                    cxyz.push(
                        Number.parseFloat(transform[0][`transform${index}`])
                    );
                    index++;
                }
                ret.arrangeMatrix[$.name] = {
                    center: [cxyz[0], cxyz[1], cxyz[2]],
                    xNormal: [cxyz[3], cxyz[4], cxyz[5]],
                    yNormal: [cxyz[6], cxyz[7], cxyz[8]],
                    zNormal: [cxyz[9], cxyz[10], cxyz[11]],
                };
            }
        }
        // 读dentalArchSettings
        if (dentalArch.W && dentalArch.AxisCoor && dentalArch.AxisCoor) {
            ret.dentalArchSettings = {
                W: Number.parseFloat(dentalArch.W[0].$.W),
                zLevelOfArch: Number.parseFloat(dentalArch.Z[0].$.Z),
                axisCoord: Number.parseFloat(dentalArch.AxisCoor[0].$.AxisCoor),
            };
        }
        if (dentalArch.coefficient) {
            ret.dentalArchSettings.coEfficients = [];
            let index = 0;
            while (dentalArch.coefficient[0].$[`coefficient${index}`]) {
                ret.dentalArchSettings.coEfficients.push([
                    Number.parseFloat(
                        dentalArch.coefficient[0].$[`coefficient${index}`]
                    ),
                ]);
                index++;
            }
        }
        // 读标准坐标系
        if (dentalArch.transform) {
            let index = 0;
            let cxyz = [];
            while (dentalArch.transform[0].$[`transform${index}`]) {
                cxyz.push(
                    Number.parseFloat(
                        dentalArch.transform[0].$[`transform${index}`]
                    )
                );
                index++;
            }
            ret.teethStandardAxis = {
                center: [cxyz[0], cxyz[1], cxyz[2]],
                xNormal: [cxyz[3], cxyz[4], cxyz[5]],
                yNormal: [cxyz[6], cxyz[7], cxyz[8]],
                zNormal: [cxyz[9], cxyz[10], cxyz[11]],
            };
        }
        // 读咬合调整的矩阵
        if (dentalArch.transformBite) {
            let index = 0;
            let cxyz = [];
            while (dentalArch.transformBite[0].$[`transform${index}`]) {
                cxyz.push(
                    Number.parseFloat(
                        dentalArch.transformBite[0].$[`transform${index}`]
                    )
                );
                index++;
            }
            ret.teethAxisFinetuneRecord = {
                center: [cxyz[0], cxyz[1], cxyz[2]],
                xNormal: [cxyz[3], cxyz[4], cxyz[5]],
                yNormal: [cxyz[6], cxyz[7], cxyz[8]],
                zNormal: [cxyz[9], cxyz[10], cxyz[11]],
            };
        }
        // 读牙弓线调整小球记录
        if (dentalArch.adjustRecord) {
            ret.dentalArchAdjustRecord = {};
            for (let {
                $: { name },
                transform,
            } of dentalArch.adjustRecord) {
                let index = 0;
                let t = [];
                while (transform[0][`transform${index}`]) {
                    t[index] = Number.parseFloat(
                        transform[0][`transform${index}`]
                    );
                    index++;
                }
                ret.dentalArchAdjustRecord[name] = {
                    center: [...t.slice(0, 3)],
                    invMatrix: [...t.slice(3)],
                };
            }
        }
    }
    return ret;
}

/**
 * @description step6: 下载托槽数据
 */
function downloadBracketData(browser) {
    const retData = {
        step: 6, // 当前正在执行第6步
        toNext: false, // 是否继续执行下一步
    };
    const { bracketDataApi } = progressConfig["5"];
    const stepConfig = progressConfig["6"];
    const dlConfig = {
        responseType: "arraybuffer",
        onDownloadProgress: (e) => {
            stepConfig.state.progress = "(已下载:" + e.loaded + ")";
            retData.toNext = false;
            self.postMessage({ ...retData, ...stepConfig.state });
        },
    };

    // 读取并解析指定托槽文件
    sendRequestWithToken({
        method: "GET",
        url: bracketDataApi,
        ...dlConfig,
    }).then(
        (resp) => {
            if (browser === "Firefox") {
                // 火狐下载的是压缩文件, 没有解压过所以需要解压
                try {
                    stepConfig.bracketData = pako.inflate(
                        new Uint8Array(resp.data)
                    ).buffer;
                } catch (e) {
                    // incorrect header check
                    stepConfig.bracketData = resp.data;
                }
            } else {
                // 而其他的下载下来就是解压过的文件
                stepConfig.bracketData = resp.data;
            }
            retData.toNext = true;
            self.postMessage({ ...retData, ...stepConfig.state });
        },
        (error) => {
            stepConfig.state.message = "下载托槽失败！";
            stepConfig.state.type = "error";
            self.postMessage({ ...retData, ...stepConfig.state });
        }
    );
}

/**
 * @description step7: 解析托槽数据
 */
function parseBracketData() {
    const retData = {
        step: 7, // 当前正在执行第7步
        toNext: false, // 是否继续执行下一步
    };
    const { xmlObj } = progressConfig["5"];
    const { bracketData } = progressConfig["6"];
    const stepConfig = progressConfig["7"];
    // 下载托槽的是整个28颗托槽, 看xml中的托槽配置, 我们只需要其中几个,最多14个托槽(比如只要上颌牙的14颗)
    const needPosNameList = xmlObj.PositionResult[0].Position.map(
        (item) => item.$.name
    );
    let finish = 0;
    let total = needPosNameList.length;
    stepConfig.state.progress = finish + "/" + total;
    // 解析下载的牙齿托槽文件(stl)
    let mutilBlobFile = new Blob([bracketData], {
        type: "application/octet-stream",
    });
    let mutilFileReader = new FileReader();
    mutilFileReader.readAsArrayBuffer(mutilBlobFile);
    mutilFileReader.onload = () => {
        let plugIn80 = new Uint8Array(80); // 80 字节
        let fullFileAB = mutilFileReader.result; // 整个file 读取为 ArrayBuffer
        let dv = new DataView(fullFileAB);
        let startIndex = 75;
        // 托槽数据从 index=75 开始, 前4位是托槽面片数, 每个托槽面片数占50个字节,
        // 即每个托槽切片长度为 length = 4 + 50 * n, n来自于开头4字节
        // fullFileAB.slice(startIndex, length), 并在头部拼接Uint8Array(80)作为头部 形成完整stl文件
        // 完整托槽数据一共有28颗托槽, 数据依照顺序 static_config.js 中的 bracketDataNameOrderList
        for (let i = 0; i < 28; i++) {
            // 切出其中一段托槽数据的stl文件
            let faceNum = dv.getUint32(startIndex, true); // 当前stl的面片数
            let length = faceNum * 50 + 4;
            let u8view = new Uint8Array(
                fullFileAB.slice(startIndex, startIndex + length)
            ); // 剪切一个stl文件
            startIndex += length; // 下一次剪切的起始位置
            let stlBlob = new Blob([plugIn80, u8view]); // 加上头部, 拼成一个完整的stl文件

            // 如果在需要的列表里就保存
            if (needPosNameList.indexOf(bracketDataNameOrderList[i]) !== -1) {
                let stlReader = new FileReader();
                stlReader.readAsArrayBuffer(stlBlob);
                stlReader.onload = () => {
                    // 按顺序读取, 读完后push到托槽列表中
                    stepConfig.stlObj.push({
                        posName: bracketDataNameOrderList[i],
                        stl: stlReader.result,
                    });
                    finish++;
                    stepConfig.state.progress = finish + "/" + total;
                    if (finish === total) {
                        retData.toNext = true;
                    }
                    self.postMessage({ ...retData, ...stepConfig.state });
                };
            }
        }
    };
}

/**
 * @description step8: 制造actor(返回pointsData[typedArray]和cellsData[typedArray])
 * 解析牙齿stl数据、托槽stl数据并制造actor
 */
function generateTeethActor() {
    const retData = {
        step: 8, // 当前正在执行第8步
        toNext: false, // 是否继续执行下一步
        allActorList: {
            teethWithGingiva: {}, // 牙龈
            tooth: {}, // 牙齿
            bracket: {}, // 托槽
        },
        mainCameraConfigs: {},
        bracketData: {},
    };
    const allActorList = {
        teethWithGingiva: {},
        tooth: {},
        bracket: {},
    };
    let mainCameraConfigs = {};
    let bracketData = {};
    // 读取牙齿stl, 牙齿xml(单牙齿分割信息+托槽信息), 托槽stl
    const firstReadFlag = progressConfig["2"].firstReadFlag;
    const { stlObj: teethStlObj, xmlObj } = progressConfig["5"];
    const { stlObj: bracketStlObj } = progressConfig["7"];
    const stepConfig = progressConfig["8"];
    const message = stepConfig.state.message;
    // ------------------------------------------------------------------------
    // 添加上/下颌牙模型actor
    // ------------------------------------------------------------------------
    stepConfig.state.message = message + "(牙龈)";
    self.postMessage({ ...retData, ...stepConfig.state });
    let { pointValues, cellValues, faceIndexDict } = parseStl(teethStlObj);
    // // 保存
    // allActorList.teethWithGingiva = {
    //     pointValues,
    //     cellValues,
    // }
    // ------------------------------------------------------------------------
    // 根据xml制造单牙齿actor+points
    // ------------------------------------------------------------------------
    stepConfig.state.message = message + "(牙齿)";
    self.postMessage({ ...retData, ...stepConfig.state });
    const segmentData = generateSegmentData(
        pointValues,
        cellValues,
        faceIndexDict,
        xmlObj.SegementResult[0].Tooth
    );

    segmentData.forEach((item) => {
        let { toothName, pointValues, cellValues } = item;
        if (toothName === "gingiva") {
            allActorList.teethWithGingiva = {
                pointValues,
                cellValues,
            };
        } else {
            // 返回主线程的数据
            allActorList.tooth[toothName] = { pointValues, cellValues };
            // 用于下一步的数据
            stepConfig.toothData[toothName] = { pointValues, cellValues };
        }
    });
    // ------------------------------------------------------------------------
    // 制造托槽actor, 同时确定镜头方向
    // ------------------------------------------------------------------------
    const { stlDataList, cameraConfigs } = generateBracketData(
        bracketStlObj,
        xmlObj.PositionResult[0].Position
    );
    let finish = 0;
    let total = stlDataList.length;
    stepConfig.state.message = message + "(托槽)";
    stepConfig.state.progress = finish + "/" + total;
    self.postMessage({ ...retData, ...stepConfig.state });
    mainCameraConfigs = cameraConfigs;
    stlDataList.forEach((item) => {
        let {
            name,
            direction,
            position: { center, xNormal, yNormal, zNormal },
            positionRotate: { centerRotate, xNormalRotate, yNormalRotate, zNormalRotate },
            pointValues,
            cellValues,
        } = item;

        // 返回主线程的数据
        allActorList.bracket[name] = { pointValues, cellValues };

        // 获得底部面片和底部边缘点(最多40点)
        const {
            bottomFaceIndexList,
            bracketBottomPointValues,
        } = estimateBracketBottomSlope(pointValues, cellValues, 10);

        // 如果是第一次读取，需要进行牙齿与托槽的碰撞检测
        // 检测完成后的中心+3法向量作为真正的初始position
        // 构造新的position和fineTuneRecord
        let position = {}
        let positionRotate = {}
        let fineTuneRecord = {}
        let fineTuneRecordRotate = {}
        let initTransMatrix = []
        let initTransMatrixRotate = []
        const teethType = progressConfig["5"].xmlObj.OriginalModel[0].$.jaw;
        if (firstReadFlag[teethType]){
            position = {
                // 托槽原始的位置
                center,
                xNormal,
                yNormal,
                zNormal,
            };
            positionRotate = {
                center:centerRotate,
                xNormal:xNormalRotate,
                yNormal:yNormalRotate,
                zNormal:zNormalRotate,
            }
            fineTuneRecord = {
                actorMatrix: {
                    // 决定托槽本身角度的法向量方向(定位中心+角度轴), 同时作为托槽进行平移、旋转时所依赖的法向量方向(移动轴)
                    center,
                    xNormal,
                    yNormal,
                    zNormal,
                },
            };
            fineTuneRecordRotate = {
                actorMatrix: {
                    // 决定托槽本身角度的法向量方向(定位中心+角度轴), 同时作为托槽进行平移、旋转时所依赖的法向量方向(移动轴)
                    center:centerRotate,
                    xNormal:xNormalRotate,
                    yNormal:yNormalRotate,
                    zNormal:zNormalRotate,
                },
            };
            // 此时item受到改变, 但直接的fineTuneRecord和position并未改变
            // 计算初始刚体变换矩阵并存入
            initTransMatrix = calculateRigidBodyTransMatrix(
                center,
                xNormal,
                yNormal,
                zNormal,
            );
            initTransMatrixRotate = calculateTransMatrix(
                position,
                positionRotate
            )
        }else{
            // 初始位置或有托槽内陷, 进行初始碰撞检测
            const {
                center: transCenter,
                xNormal: transXNormal,
                yNormal: transYNormal,
                zNormal: transZNormal,
            } = initBracketDataByLandMark(
                bottomFaceIndexList,
                bracketBottomPointValues,
                allActorList.tooth[name].pointValues,
                pointValues,
                cellValues,
                center,
                xNormal,
                yNormal,
                zNormal,
            );
            // 检测完成后的中心+3法向量作为真正的初始position
            // 构造新的position和fineTuneRecord
            position = {
                // 托槽原始的位置
                center: [...transCenter],
                xNormal: [...transXNormal],
                yNormal: [...transYNormal],
                zNormal: [...transZNormal],
            };
            fineTuneRecord = {
                actorMatrix: {
                    // 决定托槽本身角度的法向量方向(定位中心+角度轴), 同时作为托槽进行平移、旋转时所依赖的法向量方向(移动轴)
                    center: [...transCenter],
                    xNormal: [...transXNormal],
                    yNormal: [...transYNormal],
                    zNormal: [...transZNormal],
                },
            };
            fineTuneRecordRotate = {
                actorMatrix: {
                    // 决定托槽本身角度的法向量方向(定位中心+角度轴), 同时作为托槽进行平移、旋转时所依赖的法向量方向(移动轴)
                    center: [...transCenter],
                    xNormal: [...transXNormal],
                    yNormal: [...transYNormal],
                    zNormal: [...transZNormal],
                },
            };
            // 此时item受到改变, 但直接的fineTuneRecord和position并未改变
            // 计算初始刚体变换矩阵并存入

            initTransMatrix = calculateRigidBodyTransMatrix(
                transCenter,
                transXNormal,
                transYNormal,
                transZNormal,
            );
            // 如果是首次读入，那就不会有转矩信息
            initTransMatrixRotate = [
                1,0,0,0,
                0,1,0,0,
                0,0,1,0,
                0,0,0,1,
            ]
        }
        bracketData[name] = {
            direction,
            position,
            fineTuneRecord,
            fineTuneRecordRotate,
            initTransMatrix,
            initTransMatrixRotate,
            bracketBottomPointValues,
            bottomFaceIndexList,
        };
        finish++;
        stepConfig.state.progress = finish + "/" + total;
        self.postMessage({ ...retData, ...stepConfig.state });
        // 用于下一步的数据
        stepConfig.bracketData[name] = { position };
    });
    // 计算完毕后返回所有数据
    retData.allActorList = allActorList;
    retData.mainCameraConfigs = mainCameraConfigs;
    retData.bracketData = bracketData;
    retData.toNext = true;
    self.postMessage({ ...retData, ...stepConfig.state });
}

// step9
function generateTeethAxisActor() {
    const retData = {
        step: 9, // 当前正在执行第9步
        toNext: false, // 是否继续执行下一步
        longAxisData: {},
        allActorList: {
            axis: {},
            line: {},
        },
    };
    const longAxisData = {};
    const allActorList = {
        axis: {},
        line: {},
    };

    const { xmlObj } = progressConfig["5"];
    const { toothData, bracketData } = progressConfig["8"];
    const stepConfig = progressConfig["9"];

    // 读取长轴3点
    const longAxisPoints = xmlObj.PositionResult[0].Position.map((item) => ({
        name: item.$.name,
        startPoint: [
            parseFloat(item.LongAxis[0].StartCoor[0].$.Coor0),
            parseFloat(item.LongAxis[0].StartCoor[0].$.Coor1),
            parseFloat(item.LongAxis[0].StartCoor[0].$.Coor2),
        ],
        locationPoint: [
            parseFloat(item.LongAxis[0].LocationCoor[0].$.Coor0),
            parseFloat(item.LongAxis[0].LocationCoor[0].$.Coor1),
            parseFloat(item.LongAxis[0].LocationCoor[0].$.Coor2),
        ],
        endPoint: [
            parseFloat(item.LongAxis[0].EndCoor[0].$.Coor0),
            parseFloat(item.LongAxis[0].EndCoor[0].$.Coor1),
            parseFloat(item.LongAxis[0].EndCoor[0].$.Coor2),
        ],
    }));
    let finish = 0;
    let total = longAxisPoints.length;
    stepConfig.state.progress = finish + "/" + total;
    self.postMessage({ ...retData, ...stepConfig.state });
    // 以该3点构建的平面作为正平面, 其与牙齿点的交集作为一个环形坐标轴展示
    longAxisPoints.forEach((item) => {
        // 寻找对应牙齿
        const { name, startPoint, locationPoint, endPoint } = item;
        // 存放长轴数据(深拷贝, 防止随后续拖动长轴而改变)
        longAxisData[name] = {
            startPoint: [...startPoint],
            locationPoint: [...locationPoint],
            endPoint: [...endPoint],
        };
        const toothPolyData = toothData[name];
        if (toothPolyData) {
            const { pointValues, cellValues } = toothPolyData;
            const {
                position: { center, zNormal, xNormal },
            } = bracketData[name];
            // 坐标轴来源：一个个垂直或平行的网格状相交平面与牙齿点集的交集
            // 平面决定于一个法向量+一个平面上的点
            // 坐标轴的一个法向量分别为 startPoint->endPoint
            // 另一个法向量为startPoint->endPoint与托槽zNormal的叉乘方向
            // 而平面上的点需要经一定计算均匀选取
            const axisActors = getCutActorList(
                startPoint,
                endPoint,
                zNormal,
                pointValues,
                cellValues,
                1
            );
            const lineActor = initDistanceLine(
                center,
                startPoint,
                endPoint,
                zNormal,
                xNormal,
                1.5,
                pointValues,
                cellValues
            );
            allActorList.axis[name] = axisActors;
            allActorList.line[name] = lineActor;
        }
        finish++;
        stepConfig.state.progress = finish + "/" + total;
        self.postMessage({ ...retData, ...stepConfig.state });
    });
    // 计算完毕后返回所有数据
    retData.allActorList = allActorList;
    retData.longAxisData = longAxisData;
    retData.toNext = true;
    self.postMessage({ ...retData, ...stepConfig.state });
}

// step10
function generateTeethRootActor() {
    const retData = {
        step: 10, // 当前正在执行第10步
        toNext: false, // 是否继续执行下一步
        longAxisData: {},
        allActorList: {
            root: [],
            rootGenerate: [],
            originRoot: [],
        },
    };
    const teethType = targetTeethType;
    const { xmlObj } = progressConfig["5"];
    const teethRootData = xmlObj.teethRootData
    const { toothData, bracketData } = progressConfig["8"];
    const toothPolyDatas = [];
    Object.keys(toothData).forEach((name) => {
        const polyData = vtkPolyData.newInstance();
        polyData.getPoints().setData(toothData[name].pointValues);
        polyData.getPolys().setData(toothData[name].cellValues);
        toothPolyDatas[name] = polyData;
    });
    const stepConfig = progressConfig["10"];

    let finish = 0;
    let total = 1;
    stepConfig.state.progress = finish + "/" + total;
    self.postMessage({ ...retData, ...stepConfig.state });
    // 生成牙根方向圆锥数据
    for(let toothName in toothPolyDatas){
        if(toothName[0].toLowerCase()==teethType[0]){
            var rootTopPoint;
            var rootBottomPoint;
            var rootRadiusPoint;
            if(teethRootData && teethRootData.length>0){
                const curRootData = teethRootData.filter(obj => obj.toothName[0] === toothName)[0];
                rootTopPoint = curRootData.topSphereCenter[0].split(",").map(part => parseFloat(part))
                rootBottomPoint = curRootData.bottomSphereCenter[0].split(",").map(part => parseFloat(part))
                rootRadiusPoint = curRootData.radiusSphereCenter[0].split(",").map(part => parseFloat(part))
            }else{
                // 使用托槽z轴方向作为牙根方向
                var upNormal = [
                    -bracketData[toothName].position.yNormal[0],
                    -bracketData[toothName].position.yNormal[1],
                    -bracketData[toothName].position.yNormal[2],
                ];             
                const bounds = toothPolyDatas[toothName].getBounds()
                rootTopPoint = [
                    (bounds[0]+bounds[1])/2,
                    (bounds[2]+bounds[3])/2,
                    (bounds[4]+bounds[5])/2,
                ] //牙根底部点坐标
                // const upNormal = []
                // subtract(longAxisData[toothName].endPoint,longAxisData[toothName].startPoint,upNormal)
                // normalize(upNormal)
                rootBottomPoint = [] //牙根顶部点坐标
                add(rootTopPoint, multiplyScalar(upNormal, 7), rootBottomPoint)
                const rootRadius = Math.min(bounds[1]-bounds[0],bounds[3]-bounds[2])/4
                const radiusNormal = [] //半径方向
                cross(upNormal, [0,1,0], radiusNormal)
                normalize(radiusNormal)
                rootRadiusPoint = [] //牙根半径点坐标
                add(rootBottomPoint, multiplyScalar(radiusNormal, rootRadius), rootRadiusPoint)
            }
            
            //由于worker不能发送actor对象，只能先将坐标发回去，在主线程中构造
            retData.allActorList.root.push({
                toothName,
                bottomSphereCenter: rootBottomPoint,
                topSphereCenter: rootTopPoint,
                radiusSphereCenter: rootRadiusPoint,
            })
        }
    }

    // 如果CADO中含有牙根数据，说明之前保存过，则需要直接生成牙根
    // 如果不存在牙根数据，则不生成
    if(teethRootData && teethRootData.length>0){
        generateRoot(teethType, toothData, retData.allActorList.root)
        .then((result) => {
            retData.allActorList.rootGenerate = result.rootList;
            retData.allActorList.originRoot = result.originRootList;

            finish++;
            stepConfig.state.progress = finish + "/" + total;
            self.postMessage({ ...retData, ...stepConfig.state });

            retData.toNext = true;
            self.postMessage({ ...retData, ...stepConfig.state });
        })
        .catch((error) => {
            console.error(error); // 处理错误情况
        });
    }else{
        finish++;
        stepConfig.state.progress = finish + "/" + total;
        self.postMessage({ ...retData, ...stepConfig.state });

        retData.toNext = true;
        self.postMessage({ ...retData, ...stepConfig.state });
    }
}

async function generateRoot(teethType, toothData, rootInfoList) {
    let rootList = [];
    let originRootList = [];
    const promises = []; // 存储每个请求的 Promise 对象
  
    Object.entries(toothData).forEach(([toothName, toothValues]) => {
      if (toothName[0].toLowerCase() === teethType[0]) {
    //   if (toothName === 'LR6') {
        const rootInfo = rootInfoList.filter(obj => obj.toothName === toothName)[0];
        const jsonPart = JSON.stringify(rootInfo);
        let formData = new FormData();
        formData.append("polyData", new Blob([JSON.stringify(toothValues)], { type: "application/json" }));
        formData.append("jsonPart", new Blob([jsonPart], { type: "application/json" }));
  
        const generateRootPath = "/backend/generate_root_json/";
  
        // 将请求包装成 Promise 对象
        const promise = new Promise((resolve, reject) => {
          sendRequestWithToken({
            method: "POST",
            url: encodeURI(generateRootPath),
            data: formData,
            responseType: "json",
            headers: {
              "Cache-Control": "no-cache",
            },
          })
            .then((resp) => {
                const pointValues = resp.data.pointValues;
                const cellValues = resp.data.cellValues;
                rootList.push({ 
                    toothName, 
                    pointValues,
                    cellValues,
                });
                const clonePointValues = structuredClone(pointValues)
                const cloneCellValues = structuredClone(cellValues)
                originRootList.push({ 
                    toothName, 
                    pointValues: clonePointValues,
                    cellValues: cloneCellValues,
                });
                resolve(); // 请求成功，resolve
            })
            .catch((error) => {
              console.log("error");
              reject(error); // 请求失败，reject
            });
        });
  
        promises.push(promise); // 将每个请求的 Promise 对象添加到数组中
      }
    // }
    });
  
    await Promise.all(promises); // 等待所有请求完成
    return { rootList, originRootList };
  }

self.onmessage = function(event) {
    const { step } = event.data;
    switch (step) {
        case 2: {
            const {
                configApi,
                teethType,
                windowLinkConfig,
                authToken,
                authId,
            } = event.data;
            targetTeethType = teethType;
            windowLinkConfigClone = windowLinkConfig;
            token = authToken;
            userId = authId;
            setTokenHeader(authToken);
            setUserIdHeader(authId);
            modifyStateMessageByTeethType();
            queryModelPath(configApi);
            break;
        }
        case 3: {
            downloadModel();
            break;
        }
        case 4: {
            handleModel();
            break;
        }
        case 5: {
            parseCADO();
            break;
        }
        case 6: {
            const { browser } = event.data;
            downloadBracketData(browser);
            break;
        }
        case 7: {
            parseBracketData();
            break;
        }
        case 8: {
            generateTeethActor();
            break;
        }
        case 9: {
            generateTeethAxisActor();
            break;
        }
        case 10: {
            const {} = event.data;
            generateTeethRootActor();
            break;
        }
    }
};
