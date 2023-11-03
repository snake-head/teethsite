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
    const K = projection(CS, zNormal);
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
 * @description: 在pointsValue中查找z最小的点坐标
 * @param {*} points pointsValue
 * @return {*} z最小的点坐标
 * @author: ZhuYichen
 */
function findMinZCoordinate(points) {
    let minZ = Infinity;
    let minZPoint = null;

    for (let i = 2; i < points.length; i += 3) {
        const zCoordinate = points[i];
        if (zCoordinate < minZ) {
            minZ = zCoordinate;
            minZPoint = [points[i-2], points[i-1], points[i]];
        }
    }

    return minZPoint;
}

/**
 * @description: 在pointsValue中查找z最大的点坐标
 * @param {*} points pointsValue
 * @return {*} z最大的点坐标
 * @author: ZhuYichen
 */
function findMaxZCoordinate(points) {
    let maxZ = -Infinity;
    let maxZPoint = null;

    for (let i = 2; i < points.length; i += 3) {
        const zCoordinate = points[i];
        if (zCoordinate > maxZ) {
            maxZ = zCoordinate;
            maxZPoint = [points[i-2], points[i-1], points[i]];
        }
    }

    return maxZPoint;
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
    // 把原算法的startPoint改成牙齿最尖端的点即可，因此需要构造一个平面切割牙齿点云
    // 平面法向量是托槽的xNormal，点是center

    // ----------------------------------
    // 构造平面, 构造切割
    // ----------------------------------
    const toothPolyData = vtkPolyData.newInstance();
    toothPolyData.getPoints().setData(pointValues);
    toothPolyData.getPolys().setData(cellValues);
    const plane = vtkPlane.newInstance();
        plane.setOrigin(...center);
        plane.setNormal(...xNormal);
    const cutter = vtkCutter.newInstance();
        cutter.setCutFunction(plane); // 使用plane切割
        cutter.setInputData(toothPolyData); // 切割对象为牙齿polyData
    const cutPoints = cutter.getOutputData().getPoints().getData()
    // 上颌牙找最低点，下颌牙找最高点
    const tipPoint = startPoint[2]<endPoint[2]?findMinZCoordinate(cutPoints):findMaxZCoordinate(cutPoints)

    // 计算过tipPoint，沿zNormal方向的向量
    const CS = [
        tipPoint[0] - center[0],
        tipPoint[1] - center[1],
        tipPoint[2] - center[2],
    ]
    // tipPoint 在zNormal上的投影点K
    const K = projection(CS, zNormal);
    const KS = [
        tipPoint[0] - K[0],
        tipPoint[1] - K[1],
        tipPoint[2] - K[2],
    ]
    const M = [
        floatDist * zNormal[0] + KS[0],
        floatDist * zNormal[1] + KS[1],
        floatDist * zNormal[2] + KS[2],
    ]

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
    const linePointValues = new Float32Array([
        ...textPositionPoint, // 第0个点就是text的位置
        ...tipPoint,
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

    return { linePointValues, distance };
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
function projection(a, b) {
    const dot = dotProduct(a, b);
    const magSquared = Math.pow(vectorMagnitude(b), 2);
    const scaleFactor = dot / magSquared;

    const projection = b.map(element => element * scaleFactor);
    return projection;
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
        linePolyData.getLines().setData(cellValues);

        const mapper = vtkMapper.newInstance();
        mapper.setInputData(linePolyData);
        const lineActor = vtkActor.newInstance();

        lineActor.setMapper(mapper);
        lineActor.getProperty().setColor(1, 0, 1);

        const psMapper = vtkPixelSpaceCallbackMapper.newInstance(); // 遍历输入数据的每个点, 根据相机3D坐标计算平面2D坐标
        psMapper.setInputData(linePolyData);

        const textActor = vtkActor.newInstance();
        textActor.setMapper(psMapper);

        // 构造返回对象(主要为了浅拷贝)
        const lineActorItem = {
            startPoint,
            endPoint,
            lineActor,
            textActor,
            distance, // 修改distance即可直接修改显示的距离文字
            linePolyData, // 修改其中的points数组即可影响到直线actor的生成
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
        let { startPoint, endPoint, linePolyData, lineActor } = lineActorItem;

        // const { pointValues, distance } = calculateLineActorPointsAndDistance(
        //     center,
        //     startPoint,
        //     endPoint,
        //     zNormal,
        //     floatDist
        // );
        const { linePointValues, distance } = calculateLineActorPointsAndDistanceNew(
            center,
            startPoint,
            endPoint,
            zNormal,
            xNormal,
            floatDist,
            pointValues,
            cellValues,
        );
        linePolyData.getPoints().setData(linePointValues); // 更新直线
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
            renderWindow.render(); // 重新计算移除直线后的屏幕
            renderer.addActor(lineActor); // 以新的actor移入屏幕触发mapper重新根据输入数据计算
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
