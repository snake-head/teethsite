import vtkPolyData from "@kitware/vtk.js/Common/DataModel/PolyData";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkPixelSpaceCallbackMapper from "../reDesignVtk/reDesignPixelSpaceCallbackMapper";
import {
    normalize,
    subtract,
    dot,
    distance2BetweenPoints,
} from "@kitware/vtk.js/Common/Core/Math";
import vtkCutter from "@kitware/vtk.js/Filters/Core/Cutter";
import vtkPlane from "@kitware/vtk.js/Common/DataModel/Plane";
import vtkCylinderSource from "@kitware/vtk.js/Filters/Sources/CylinderSource";


import { bracketNameList } from "../static_config";
import { reactive } from "vue";
import { detectPageZoom } from "../utils/browserTypeDetection";

/**
 *
 * @param center 托槽中心
 * @param startPoint 牙尖点
 * @param endPoint 牙底点
 * @param zNormal 托槽法向量
 * @param floatDist 直线沿zNormal方向上浮距离
 * @return {{pointValues: Float32Array, distance: number}}
 */
function calculateLineActorPointsAndDistance(
    center,
    startPoint,
    endPoint,
    zNormal,
    floatDist
) {
    // 2023.10.13更新：原先采用的距离线算法是距离线与牙齿长轴平行，现修改为与托槽znormal垂直
    // 我们需要构建的三段直线的另外两个顶点需要漂浮在actor上方(或者说前面)让用户看到
    // 因此,首先将center沿zNormal方向移动1.5个距离得到centerFloat, 使这个点必定在托槽脱离牙齿的上方
    const centerFloat = [
        center[0] + floatDist * zNormal[0],
        center[1] + floatDist * zNormal[1],
        center[2] + floatDist * zNormal[2],
    ];
    // 构造平面startPointPlane: origin=startPoint, normal=endPoint-startPoint
    // 构造平面centerPointPlane: origin=center, normal=endPoint-startPoint
    // const normal = [
    //     endPoint[0] - startPoint[0],
    //     endPoint[1] - startPoint[1],
    //     endPoint[2] - startPoint[2],
    // ];
    // normalize(normal); // 归一化
    // 然后将centerFloat分别投射到平面startPointPlane、centerPointPlane得到第3个点startPlaneProj、第4个点centerPlaneProj
    // const startPlaneProj = projectPointToPlane(centerFloat, startPoint, normal);
    // const centerPlaneProj = projectPointToPlane(centerFloat, center, normal);

    // 我们需要的4个点构成一个LineActor, startPoint->startPlaneProj->centerPlaneProj->center
    // 为了distance考虑, distance需要显示在centerPlaneProj->startPlaneProj中间位置偏上(上方向定义为startPoint->startPlaneProj)
    // 因此多加一个点用于后续psMapper
    // const upDirection = [
    //     startPlaneProj[0] - startPoint[0],
    //     startPlaneProj[1] - startPoint[1],
    //     startPlaneProj[2] - startPoint[2],
    // ];
    // normalize(upDirection);
    // const textPositionPoint = [
    //     (centerPlaneProj[0] + startPlaneProj[0]) / 2 + 0.4 * upDirection[0],
    //     (centerPlaneProj[1] + startPlaneProj[1]) / 2 + 0.4 * upDirection[1],
    //     (centerPlaneProj[2] + startPlaneProj[2]) / 2 + 0.4 * upDirection[2],
    // ];
    // 以下是更新的代码
    // 计算过startPoint，沿zNormal方向的向量
    const CS = [
        startPoint[0] - center[0],
        startPoint[1] - center[1],
        startPoint[2] - center[2],
    ]
    // startPoint 在zNormal上的投影点K
    const K = projectionPoint2Vector(CS, zNormal);
    const KS = [
        startPoint[0] - K[0],
        startPoint[1] - K[1],
        startPoint[2] - K[2],
    ]
    const M = [
        floatDist * zNormal[0] + KS[0],
        floatDist * zNormal[1] + KS[1],
        floatDist * zNormal[2] + KS[2],
    ]

    // startPoint->startPlaneProj->centerPlaneProj->center
    // const pointValues = new Float32Array([
    //     ...textPositionPoint, // 第0个点就是text的位置
    //     ...startPoint,
    //     ...startPlaneProj,
    //     ...centerPlaneProj,
    //     ...center,
    // ]);
    // startPoint->M->centerFloat->center
    const upDirection = [
        M[0] - startPoint[0],
        M[1] - startPoint[1],
        M[2] - startPoint[2],
    ];
    normalize(upDirection);
    const textPositionPoint = [
        (centerFloat[0] + M[0]) / 2 + 0.4 * upDirection[0],
        (centerFloat[1] + M[1]) / 2 + 0.4 * upDirection[1],
        (centerFloat[2] + M[2]) / 2 + 0.4 * upDirection[2],
    ];
    const pointValues = new Float32Array([
        ...textPositionPoint, // 第0个点就是text的位置
        ...startPoint,
        ...M,
        ...centerFloat,
        ...center,
    ]);

    // 计算两个平面之间的距离
    // const distance = Math.sqrt(
    //     distance2BetweenPoints(centerPlaneProj, startPlaneProj)
    // );
    const distance = Math.sqrt(
        distance2BetweenPoints(M, centerFloat)
    );

    return { pointValues, distance };
}

/**
 * @description: 在pointsValue中查找沿SE方向距离endpoint最远的点
 * @param {*} points pointsValue
 * @return {*} 最远点坐标
 * @author: ZhuYichen
 */
function findMaxDistancePoint(points, S, E) {
    let maxDistance = -Infinity;
    let maxDistancePoint = null;
    const ES = [
        S[0]-E[0],
        S[1]-E[1],
        S[2]-E[2],
    ]

    for (let i = 0; i < points.length; i += 3) {
        const K = [
            points[i],
            points[i+1],
            points[i+2],
        ]
        const EK = [
            K[0]-E[0],
            K[1]-E[1],
            K[2]-E[2],
        ]
        // 将点投影到ES向量上
        const EP = projectionPoint2Vector(EK, ES);
        const distance = vectorMagnitude(EP)
        if (distance > maxDistance) {
            maxDistance = distance;
            maxDistancePoint = K
        }
    }

    return maxDistancePoint;
}

/**
 * @description: 向量叉乘
 * @param {*} vector1
 * @param {*} vector2
 * @return {*}
 * @author: ZhuYichen
 */
function crossProduct(vector1, vector2) {
    const x = vector1[1] * vector2[2] - vector1[2] * vector2[1];
    const y = vector1[2] * vector2[0] - vector1[0] * vector2[2];
    const z = vector1[0] * vector2[1] - vector1[1] * vector2[0];
    return [x, y, z];
}

/**
 * @description: 借助cylindersource构造一个圆面
 * @param {*} center
 * @param {*} radius
 * @param {*} direction
 * @return {*}
 * @author: ZhuYichen
 */
function createCircleGeometry(center, radius, direction) {
    const resolution = 320; // 分辨率，可以根据需要调整
  
    // 创建一个圆形的几何图形
    const circleSource = vtkCylinderSource.newInstance({
      height: 0,   // 高度设置为0以创建一个平面
      radius,      // 圆的半径
      resolution,  // 分辨率，决定圆的光滑度
    });
  
    // 设置圆心位置
    circleSource.setCenter(center);
  
    // 设置方向
    normalize(direction)
    const normal = direction;
    circleSource.setDirection(normal);
  
    // 获取几何数据
    const outputData = circleSource.getOutputData();
  
    // 获取点数据和多边形数据
    const circlePoints = outputData.getPoints().getData();
    const circlePolys = outputData.getPolys().getData();
  
    return { circlePoints, circlePolys };
  }

/**
 * @description: 求直线AB与平面的交点C
 * @param pointA 直线上一点A
 * @param pointB 直线上一点B
 * @param normal 平面法向量
 * @param pointO 平面上一点O
 * @return {*} 交点C的坐标
 * @author: ZhuYichen
 */
function lineCrossPlane(
    pointA,
    pointB,
    normal,
    pointO,
){
    const a = pointA[0] - pointB[0];
    const b = pointA[1] - pointB[1];
    const c = pointA[2] - pointB[2];

    const d = normal[0];
    const e = normal[1];
    const f = normal[2];

    const x0 = pointA[0];
    const y0 = pointA[1];
    const z0 = pointA[2];

    const x1 = pointO[0];
    const y1 = pointO[1];
    const z1 = pointO[2];

    const t = (d * (x1 - x0) + e * (y1 - y0) + f * (z1 - z0)) / (d * a + e * b + f * c);

    const intersectionPoint = [x0 + t * a, y0 + t * b, z0 + t * c];

    return intersectionPoint;
}
/**
 *
 * @param center 托槽中心
 * @param startPoint 牙尖点
 * @param endPoint 牙底点
 * @param zNormal 托槽法向量
 * @param floatDist 直线沿zNormal方向上浮距离
 * @return {{pointValues: Float32Array, distance: number}}
 */
function calculateLineActorPointsAndDistanceNew(
    center,
    startPoint,
    endPoint,
    zNormal,
    xNormal,
    floatDist,
    pointValues,
    cellValues,
) {
    // 2023.11.02更新：原先采用的距离线算法是以牙尖小球为距离线终点，现在改为牙齿最尖端
    // 我们需要构建的三段直线的另外两个顶点需要漂浮在actor上方(或者说前面)让用户看到
    // 因此,首先将center沿zNormal方向移动1.5个距离得到centerFloat, 使这个点必定在托槽脱离牙齿的上方
    const centerFloat = [
        center[0] + floatDist * zNormal[0],
        center[1] + floatDist * zNormal[1],
        center[2] + floatDist * zNormal[2],
    ];
    // 以下是更新的代码
    // 将所有牙齿所有的点投影到startpoint->endpoint这条线上
    // 尖端=距离endpoint最远的投影点
    const SE = [
        endPoint[0] - startPoint[0],
        endPoint[1] - startPoint[1],
        endPoint[2] - startPoint[2],
    ]
    // 由于距离线要求与zNormal垂直，但垂面的方向需要由SE方向决定
    // 所以首先将S和E都投影到以z为法向量过centerFloat的平面上
    const S2 = projectPointToPlane(startPoint, centerFloat, zNormal)
    const E2 = projectPointToPlane(endPoint, centerFloat, zNormal)
    // 以S2E2为垂面法向量，则垂面必然平行于z
    const planeNormal = [
        E2[0] - S2[0],
        E2[1] - S2[1],
        E2[2] - S2[2],
    ]

    const tipPoint = findMaxDistancePoint(pointValues, S2, E2)

    // 将centerFloat投影到垂面上，得到M点
    normalize(planeNormal)
    const M = projectPointToPlane(centerFloat, tipPoint, planeNormal)

    const upDirection = [
        M[0] - tipPoint[0],
        M[1] - tipPoint[1],
        M[2] - tipPoint[2],
    ];
    normalize(upDirection);
    const textPositionPoint = [
        (centerFloat[0] + M[0]) / 2 + 0.4 * upDirection[0],
        (centerFloat[1] + M[1]) / 2 + 0.4 * upDirection[1],
        (centerFloat[2] + M[2]) / 2 + 0.4 * upDirection[2],
    ];
    // 构造距离线，这里写两个M是因为之前由四个顶点构成，现在只需要三个点
    const linePointValues = new Float32Array([
        ...textPositionPoint, // 第0个点就是text的位置
        ...M,
        ...M,
        ...centerFloat,
        ...center,
    ]);
    const distance = Math.sqrt(
        distance2BetweenPoints(M, centerFloat)
    );
    // 构造垂面
    const C = lineCrossPlane(endPoint, startPoint, planeNormal, tipPoint)
    const {circlePoints, circlePolys} = createCircleGeometry(C, 4, planeNormal)
    return { linePointValues, distance, circlePoints, circlePolys };
}

/**
 * @description 点投影至平面坐标
 * @param x
 * @param origin
 * @param normal
 * @return {number[]}
 */
function projectPointToPlane(x, origin, normal) {
    // |normal| = 1
    const xo = [];
    subtract(x, origin, xo);
    const t = dot(normal, xo); // |xo|cos<normal, xo> : 线段xo在normal上的投影距离
    // 若视角水平线对着平面, normal向正上方, 则origin沿normal方向往上t个距离可以与x平齐
    // x沿normal方向往下t个距离, 就是x在平面上的投影点
    return [x[0] - t * normal[0], x[1] - t * normal[1], x[2] - t * normal[2]];
}

/**
 * 计算两个向量的点积
 * @param {number[]} a - 第一个向量
 * @param {number[]} b - 第二个向量
 * @returns {number} 两个向量的点积
 */
function dotProduct(a, b) {
    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result += a[i] * b[i];
    }
    return result;
}

/**
 * 计算一个向量的模长
 * @param {number[]} b - 要计算模长的向量
 * @returns {number} 向量的模长
 */
function vectorMagnitude(b) {
    let result = 0;
    for (let i = 0; i < b.length; i++) {
        result += Math.pow(b[i], 2);
    }
    return Math.sqrt(result);
}

/**
 * 计算一个向量在另一个向量上的投影坐标
 * @param {number[]} a - 要投影的向量
 * @param {number[]} b - 作为投影方向的向量
 * @returns {number[]} 投影结果向量
 */
function projectionPoint2Vector(a, b) {
    const dot = dotProduct(a, b);
    const magSquared = Math.pow(vectorMagnitude(b), 2);
    const scaleFactor = dot / magSquared;

    const projectionPoint2Vector = b.map(element => element * scaleFactor);
    return projectionPoint2Vector;
}

export { 
    calculateLineActorPointsAndDistance, 
    calculateLineActorPointsAndDistanceNew 
};

export default function() {
    let distanceMessageList = reactive([]);

    function initDistanceMessageList() {
        for (let i = 0; i < 7; i++) {
            distanceMessageList.push([]); // 共7列数据
        }
        bracketNameList.forEach((name, index) => {
            const rowId = index % 4; // 第几行 0123
            const colId = Math.floor(index / 4); // 第几列 01234567
            distanceMessageList[colId].push({
                name,
                key: index,
                rowId,
                colId,
                distance: undefined,
            });
        });
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
     * @param vtkTextContainer vtkTextContainer.value
     * @param pointValues 距离线点集
     * @param cellValues 距离线组成
     * @param distance 距离线显示初始距离
     */
    function initDistanceLineWithData(
        center,
        startPoint,
        endPoint,
        zNormal,
        floatDist,
        vtkTextContainer,
        pointValues,
        cellValues,
        distance
    ) {
        const linePolyData = vtkPolyData.newInstance();
        linePolyData.getPoints().setData(pointValues);
        linePolyData.getLines().setData(cellValues.slice(0,9));

        const mapper = vtkMapper.newInstance();
        mapper.setInputData(linePolyData);
        const lineActor = vtkActor.newInstance();

        lineActor.setMapper(mapper);
        lineActor.getProperty().setColor(1, 0, 1);
        // 分别构造line和plane的actor
        const planePolyData = vtkPolyData.newInstance();
        planePolyData.getPoints().setData(pointValues);
        planePolyData.getPolys().setData(cellValues);

        const planeMapper = vtkMapper.newInstance();
        planeMapper.setInputData(planePolyData);
        const planeActor = vtkActor.newInstance();

        planeActor.setMapper(planeMapper);
        planeActor.getProperty().setColor(1, 0, 1);
        planeActor.getProperty().setOpacity(0.4);

        const psMapper = vtkPixelSpaceCallbackMapper.newInstance(); // 遍历输入数据的每个点, 根据相机3D坐标计算平面2D坐标
        psMapper.setInputData(linePolyData);

        const textActor = vtkActor.newInstance();
        textActor.setMapper(psMapper);

        // 构造返回对象(主要为了浅拷贝)
        const lineActorItem = {
            startPoint,
            endPoint,
            lineActor,
            planeActor,
            textActor,
            distance, // 修改distance即可直接修改显示的距离文字
            linePolyData, // 修改其中的points数组即可影响到直线actor的生成
            planePolyData,
            mapper,
            psMapper,
        };

        // 左上角为(0,0)点
        psMapper.setCallback((coordsList) => {
            const ratio = detectPageZoom();
            const dims = vtkTextContainer.getBoundingClientRect();
            const textCtx = vtkTextContainer.getContext("2d");
            if (textCtx && dims) {
                textCtx.clearRect(0, 0, dims.width, dims.height);
                textCtx.font =
                    Math.round(40 / ratio).toString() + "px 微软雅黑";
                textCtx.textAlign = "center";
                textCtx.textBaseline = "middle";
                textCtx.fillStyle = "#00FFFF";
                textCtx.fillText(
                    lineActorItem.distance.toFixed(2),
                    coordsList[0][0] / ratio,
                    dims.height - coordsList[0][1] / ratio
                );
            }
        });

        return lineActorItem;
    }

    /**
     * @description: 用于合并两个pointsdata
     * @param {*} pointsData1
     * @param {*} pointsData2
     * @return {*}
     * @author: ZhuYichen
     */
    function combinePointData(pointsData1, pointsData2) {
        // 合并两组点数据
        const combinedPointsData = new Float32Array(pointsData1.length + pointsData2.length);
        combinedPointsData.set(pointsData1, 0);
        combinedPointsData.set(pointsData2, pointsData1.length);
      
        return combinedPointsData;
      }
    /**
     * @description 在托槽微调时调用, 重置时也调用, 更新对应lineActor
     * 微调时直接用, 重置单个时直接用, 重置所有时读取当前选中托槽名称直接用
     * @param lineActorItem 从其中读取
     * @param toothName 牙齿名称, 用于读取对应数据
     * @param center 托槽微调后中心
     * @param zNormal 托槽微调后zNormal
     * @param floatDist 直线沿zNormal方向上浮距离
     * @param renderer 用于lineActor强制更新
     * @param renderWindow 用于lineActor强制更新
     */
    function updateDistanceLine(
        lineActorItem,
        toothName,
        center,
        zNormal,
        xNormal,
        floatDist,
        renderer,
        renderWindow,
        pointValues,
        cellValues
    ) {
        let { startPoint, endPoint, linePolyData, planePolyData, lineActor, planeActor } = lineActorItem;

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
        const combinedPointsData= combinePointData(linePointValues, circlePoints)
        linePolyData.getPoints().setData(combinedPointsData); // 更新直线
        planePolyData.getPoints().setData(combinedPointsData); // 更新底面
        lineActorItem.distance = distance; // 更新距离与显示

        // 更新列表
        distanceMessageList.forEach((itemList) => {
            itemList.forEach((item) => {
                if (item.name === toothName) {
                    item.distance = distance;
                }
            });
        });

        // mapper的设置方式为inputData可能导致其无法及时根据输入更新, 此处为强制更新(先移出屏幕再移进去)
        if (renderer && renderWindow) {
            renderer.removeActor(lineActor);
            renderer.removeActor(planeActor);
            renderWindow.render(); // 重新计算移除直线后的屏幕
            renderer.addActor(lineActor); // 以新的actor移入屏幕触发mapper重新根据输入数据计算
            renderer.addActor(planeActor); // 以新的actor移入屏幕触发mapper重新根据输入数据计算
            renderWindow.render();
        }
    }

    return {
        distanceMessageList,
        initDistanceMessageList,
        initDistanceLineWithData,
        updateDistanceLine,
    };
}
