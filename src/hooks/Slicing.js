import { useStore } from "vuex";
import vtkCellArray from "@kitware/vtk.js/Common/Core/CellArray";
import vtkPoints from "@kitware/vtk.js/Common/Core/Points";
import vtkPolyData from "@kitware/vtk.js/Common/DataModel/PolyData";
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import { normalize, cross, subtract, multiplyScalar, add } from "@kitware/vtk.js/Common/Core/Math";
import { projectToAxis } from "../utils/bracketFineTuneByTypedArray";


export default function(toothPolyDatas, bracketData, currentSelectBracket, allActorList){
    const store = useStore();
    /**
    * @description：1.双击后，先在牙齿周围生成闭合的立体包围盒
     * 2.使得包围盒可以随着鼠标键盘按键移动（整个移动）
     * 3.根据包围盒移动后的坐标点对牙齿点云进行切割
     * @param mode 开启模式为"enter"，关闭模式为"quit"
     * @param toothPolyDatas 牙齿PolyData
     */
    function SurroundingBoxs(
        toothPolyDatas,
        bracketData,
        currentSelectBracket,
        allActorList
    ){
        // 寻找是上颌牙还是下颌牙
        let PointPosition = "upper"
        const { actor: currentSelectBracketActor } = currentSelectBracket;
        for (let teethType of ["upper", "lower"]) {
            allActorList[teethType].bracket.forEach((item) => {
                const { actor } = item;
                if (currentSelectBracketActor === actor){
                    PointPosition = teethType;
                }
            })}
        store.dispatch("actorHandleState/updataSelectedPositionTooth", PointPosition);
        let x_axis = [0, 0, 0];
        let y_axis = [0, 0, 0];
        let z_axis = [0, 0, 0];
        // 寻找托槽的三维坐标
        bracketData[PointPosition].forEach(bracket => {
            if (bracket.name == currentSelectBracket.name){
                x_axis = bracket.position.xNormal;
                y_axis = bracket.position.yNormal;
                z_axis = bracket.position.zNormal;
            }
        });
        normalize(x_axis);
        normalize(y_axis);
        normalize(z_axis);
        const axis = [x_axis, y_axis, z_axis];
        store.dispatch("actorHandleState/updataBoxAxis", axis);
        const toothPoints = toothPolyDatas[currentSelectBracket.name].getPoints();
        const numPoints = toothPoints.getNumberOfPoints();
        
        let minX = Infinity;
        let minY = Infinity;
        let minZ = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let maxZ = -Infinity;
    
        // 投影单个牙齿到该三维上
        for (let i = 0; i < numPoints; i++) {
            const point = [0, 0, 0];
            toothPoints.getPoint(i, point);
            // const projZ = projectToAxis(zNormal, point);
            const projY = projectToAxis(y_axis, point);
            const projX = projectToAxis(x_axis, point);
            const projZ = projectToAxis(z_axis, point);
            maxX = Math.max(maxX, projX);
            minX = Math.min(minX, projX);
            maxZ = Math.max(maxZ, projZ);
            minZ = Math.min(minZ, projZ);
            maxY = Math.max(maxY, projY);
            minY = Math.min(minY, projY);
        }
        // 矩形包围框前面的四个点
        let point0 = [0, 0, 0];
        let point1 = [0, 0, 0];
        let point2 = [0, 0, 0];
        let point3 = [0, 0, 0];
        let point4 = [0, 0, 0];
        let point5 = [0, 0, 0];
        let point6 = [0, 0, 0];
        let point7 = [0, 0, 0];
        for (let i = 0; i < 3; i++){
            point0[i] = minX * x_axis[i] + minY * y_axis[i] + maxZ * z_axis[i];
            point1[i] = maxX * x_axis[i] + minY * y_axis[i] + maxZ * z_axis[i];
            point2[i] = maxX * x_axis[i] + maxY * y_axis[i] + maxZ * z_axis[i];
            point3[i] = minX * x_axis[i] + maxY * y_axis[i] + maxZ * z_axis[i];
            point4[i] = minX * x_axis[i] + minY * y_axis[i] + minZ * z_axis[i];
            point5[i] = maxX * x_axis[i] + minY * y_axis[i] + minZ * z_axis[i];
            point6[i] = maxX * x_axis[i] + maxY * y_axis[i] + minZ * z_axis[i];
            point7[i] = minX * x_axis[i] + maxY * y_axis[i] + minZ * z_axis[i];
        }
        const point = [point0, point1, point2, point3, point4, point5, point6, point7];
        store.dispatch("actorHandleState/updateSurroudingBoxs", point);
        return point
    }

    function generateBox(point){
        // const point = store.state.actorHandleState.BoxSlicing.BoxPoints;
        const point0 = point[0];
        const point1 = point[1];
        const point2 = point[2];
        const point3 = point[3];
        const point4 = point[4];
        const point5 = point[5];
        const point6 = point[6];
        const point7 = point[7];
        const CellValues = [4, 0, 1, 2, 3];
        let actors = [];
        // 矩形包围框前侧
        const PointValues0 = [...point1, ...point0, ...point3, ...point2];
        const polyData0 = vtkPolyData.newInstance();
        polyData0.getPoints().setData(PointValues0);
        polyData0.getPolys().setData(CellValues);
        const mapper0 = vtkMapper.newInstance();
        mapper0.setInputData(polyData0);
    
        const actor0 = vtkActor.newInstance();
        actor0.setMapper(mapper0);
        actor0.getProperty().setColor(1, 0, 0);
        actor0.getProperty().setOpacity(0.2);
    
        actors.push(actor0);
        
        // 矩形包围框后侧
        const PointValues1 = [...point5, ...point4, ...point7, ...point6];
        const polyData1 = vtkPolyData.newInstance();
        polyData1.getPoints().setData(PointValues1);
        polyData1.getPolys().setData(CellValues);
        const mapper1 = vtkMapper.newInstance();
        mapper1.setInputData(polyData1);
    
        const actor1 = vtkActor.newInstance();
        actor1.setMapper(mapper1);
        actor1.getProperty().setColor(1, 0, 0);
        actor1.getProperty().setOpacity(0.5);
    
        actors.push(actor1);
        
        // 矩形包围框左侧
        const PointValues2 = [...point5, ...point1, ...point2, ...point6];
        const polyData2 = vtkPolyData.newInstance();
        polyData2.getPoints().setData(PointValues2);
        polyData2.getPolys().setData(CellValues);
        const mapper2 = vtkMapper.newInstance();
        mapper2.setInputData(polyData2);
    
        const actor2 = vtkActor.newInstance();
        actor2.setMapper(mapper2);
        actor2.getProperty().setColor(1, 0, 0);
        actor2.getProperty().setOpacity(0.5);
    
        actors.push(actor2);
    
        // 矩形包围框右侧
        const PointValues3 = [...point0, ...point4, ...point7, ...point3];
        const polyData3 = vtkPolyData.newInstance();
        polyData3.getPoints().setData(PointValues3);
        polyData3.getPolys().setData(CellValues);
        const mapper3 = vtkMapper.newInstance();
        mapper3.setInputData(polyData3);
    
        const actor3 = vtkActor.newInstance();
        actor3.setMapper(mapper3);
        actor3.getProperty().setColor(1, 0, 0);
        actor3.getProperty().setOpacity(0.5);
    
        actors.push(actor3);
    
        // 矩形包围框上侧
        const PointValues4 = [...point2, ...point3, ...point7, ...point6];
        const polyData4 = vtkPolyData.newInstance();
        polyData4.getPoints().setData(PointValues4);
        polyData4.getPolys().setData(CellValues);
        const mapper4 = vtkMapper.newInstance();
        mapper4.setInputData(polyData4);
    
        const actor4 = vtkActor.newInstance();
        actor4.setMapper(mapper4);
        actor4.getProperty().setColor(1, 0, 0);
        actor4.getProperty().setOpacity(0.5);
    
        actors.push(actor4);
    
        // 矩形包围框底侧
        const PointValues5 = [...point1, ...point0, ...point4, ...point5];
        const polyData5 = vtkPolyData.newInstance();
        polyData5.getPoints().setData(PointValues5);
        polyData5.getPolys().setData(CellValues);
        const mapper5 = vtkMapper.newInstance();
        mapper5.setInputData(polyData5);
    
        const actor5 = vtkActor.newInstance();
        actor5.setMapper(mapper5);
        actor5.getProperty().setColor(1, 0, 0);
        actor5.getProperty().setOpacity(0.5);
    
        actors.push(actor5);
    
        return actors
    
        // if (vtkContext.renderer && vtkContext.renderWindow) {
        //     vtkContext.renderer.addActor(actors); // 以新的actor移入屏幕触发mapper重新根据输入数据计算
        //     vtkContext.renderWindow.render();
        // }
    };

    function resetSurroundingBoxsPoints(){
        let point0 = [0, 0, 0];
        let point1 = [0, 0, 0];
        let point2 = [0, 0, 0];
        let point3 = [0, 0, 0];
        let point4 = [0, 0, 0];
        let point5 = [0, 0, 0];
        let point6 = [0, 0, 0];
        let point7 = [0, 0, 0];
        const point = [point0, point1, point2, point3, point4, point5, point6, point7];
        store.dispatch("actorHandleState/updateSurroudingBoxs", point);
    };

    function resetSurroundingBoxs(
        actors,
        vtkContext
    ){
        for (let i = 0; i < actors.length; i++) {
            vtkContext.renderer.removeActor(actors[i]); // 渲染器对象
        }
        actors = [];
        vtkContext.renderer.resetCamera();
        vtkContext.renderWindow.render();
    }

    function fineTuneBoxPosition(option, points){
        // 上牙还是下牙
        const PointPosition = store.state.actorHandleState.BoxSlicing.SelectedPosition;
        // 移动边界框的左侧还是右侧
        const moveType = store.state.actorHandleState.BoxSlicing.availableToothSides.face;
        const moveStep = store.state.actorHandleState.BoxSlicing.boxPositionAdjust.step;
        // 坐标系
        const x_axis = store.state.actorHandleState.BoxSlicing.boxPositionAdjust.x_axis;
        const y_axis = store.state.actorHandleState.BoxSlicing.boxPositionAdjust.y_axis;
        const z_axis = store.state.actorHandleState.BoxSlicing.boxPositionAdjust.z_axis;
        // 点
        let point0 = points[0];
        let point1 = points[1];
        let point2 = points[2];
        let point3 = points[3];
        let point4 = points[4];
        let point5 = points[5];
        let point6 = points[6];
        let point7 = points[7];
        switch (moveType) {
            case "left":{
                switch (option) {
                    case "LEFT":{
                        if (PointPosition == 'upper'){
                            for (let i = 0; i < 3; i++){
                                point1[i] = point1[i] + moveStep * x_axis[i];
                                point2[i] = point2[i] + moveStep * x_axis[i];
                                point5[i] = point5[i] + moveStep * x_axis[i];
                                point6[i] = point6[i] + moveStep * x_axis[i];
                            }
                            const Tunepoints = [point0, point1, point2, point3, point4, point5, point6, point7];
                            return Tunepoints;
                        }
                        if (PointPosition == 'lower'){
                            for (let i = 0; i < 3; i++){
                                point0[i] = point0[i] - moveStep * x_axis[i];
                                point3[i] = point3[i] - moveStep * x_axis[i];
                                point4[i] = point4[i] - moveStep * x_axis[i];
                                point7[i] = point7[i] - moveStep * x_axis[i];
                            }
                            const Tunepoints = [point0, point1, point2, point3, point4, point5, point6, point7];
                            return Tunepoints;
                        }
                        break;
                    }
                    case "RIGHT":{
                        if (PointPosition == 'upper'){
                            for (let i = 0; i < 3; i++){
                                point1[i] = point1[i] - moveStep * x_axis[i];
                                point2[i] = point2[i] - moveStep * x_axis[i];
                                point5[i] = point5[i] - moveStep * x_axis[i];
                                point6[i] = point6[i] - moveStep * x_axis[i];
                            }
                            const Tunepoints = [point0, point1, point2, point3, point4, point5, point6, point7];
                            return Tunepoints;
                        }
                        if (PointPosition == 'lower'){
                            for (let i = 0; i < 3; i++){
                                point0[i] = point0[i] + moveStep * x_axis[i];
                                point3[i] = point3[i] + moveStep * x_axis[i];
                                point4[i] = point4[i] + moveStep * x_axis[i];
                                point7[i] = point7[i] + moveStep * x_axis[i];
                            }
                            const Tunepoints = [point0, point1, point2, point3, point4, point5, point6, point7];
                            return Tunepoints;
                        }
                        break;
                    }}
            break;
        }
            case "right":{
                switch (option) {
                    case "LEFT":{
                        if (PointPosition == 'upper'){
                            for (let i = 0; i < 3; i++){
                                point0[i] = point0[i] + moveStep * x_axis[i];
                                point3[i] = point3[i] + moveStep * x_axis[i];
                                point4[i] = point4[i] + moveStep * x_axis[i];
                                point7[i] = point7[i] + moveStep * x_axis[i];
                            }
                            const Tunepoints = [point0, point1, point2, point3, point4, point5, point6, point7];
                            return Tunepoints;
                        }
                        if (PointPosition == 'lower'){
                            for (let i = 0; i < 3; i++){
                                point1[i] = point1[i] - moveStep * x_axis[i];
                                point2[i] = point2[i] - moveStep * x_axis[i];
                                point5[i] = point5[i] - moveStep * x_axis[i];
                                point6[i] = point6[i] - moveStep * x_axis[i];
                            }
                            const Tunepoints = [point0, point1, point2, point3, point4, point5, point6, point7];
                            return Tunepoints;
                        }
                        break;
                    }
                    case "RIGHT":{
                        if (PointPosition == 'upper'){
                            for (let i = 0; i < 3; i++){
                                point0[i] = point0[i] - moveStep * x_axis[i];
                                point3[i] = point3[i] - moveStep * x_axis[i];
                                point4[i] = point4[i] - moveStep * x_axis[i];
                                point7[i] = point7[i] - moveStep * x_axis[i];
                            }
                            const Tunepoints = [point0, point1, point2, point3, point4, point5, point6, point7];
                            return Tunepoints;
                        }
                        if (PointPosition == 'lower'){
                            for (let i = 0; i < 3; i++){
                                point1[i] = point1[i] + moveStep * x_axis[i];
                                point2[i] = point2[i] + moveStep * x_axis[i];
                                point5[i] = point5[i] + moveStep * x_axis[i];
                                point6[i] = point6[i] + moveStep * x_axis[i];
                            }
                            const Tunepoints = [point0, point1, point2, point3, point4, point5, point6, point7];
                            return Tunepoints;
                        }
                        break;
                    }}
                break;
            }
        }
    }

    return {
        SurroundingBoxs,
        generateBox,
        resetSurroundingBoxsPoints,
        resetSurroundingBoxs,
        fineTuneBoxPosition,
    }
}

function vectorSubtract(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function crossProduct(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
}

function dotProduct(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function FineTunePiece(toothPolyDatas, currentSelectBracket, toothPosition, SurroundingBoxsPoints){
    // 初始面片信息
    let toothName;
    if (currentSelectBracket.name == null) {
        toothName = currentSelectBracket;
    }
    else {
        toothName = currentSelectBracket.name;
    }
    const pointValues = toothPolyDatas[toothName].getPoints().getData();
    const cellValues = toothPolyDatas[toothName].getPolys().getData();
    // const _ = require('lodash'); // 导入 lodash 库
    // const copiedtoothPolyDatas = _.cloneDeep(toothPolyDatas);

    const validcellValues = [];
    const validpointValues = [];

    // 选中牙齿的信息 toothPosition

    // 迭代每个面片
    for (let i = 0; i < cellValues.length; i += 4) {
        // 获取面片的顶点索引
        const v1 = cellValues[i + 1];
        const v2 = cellValues[i + 2];
        const v3 = cellValues[i + 3];

        // 根据顶点索引获取对应的顶点坐标
        const vertex1 = pointValues.slice(v1 * 3, v1 * 3 + 3);
        const vertex2 = pointValues.slice(v2 * 3, v2 * 3 + 3);
        const vertex3 = pointValues.slice(v3 * 3, v3 * 3 + 3);

        const judge = generateToothBox(SurroundingBoxsPoints, toothPosition, currentSelectBracket, vertex1, vertex2, vertex3);
        // generateToothBox(SurroundingBoxsPoints, toothPosition, currentSelectBracket, vertex1, vertex2, vertex3)
        // 判断顶点是否满足条件
        if (judge) {
            // 将满足条件的面片信息和顶点坐标保存
            validcellValues.push(...cellValues.slice(i, i + 4));
            validpointValues.push(...vertex1, ...vertex2, ...vertex3);
        }
    }
    //方案2
    // return {
    //     validpointValues,
    //     validcellValues,
    // }

    //// 替换
    // 获取 cellValues 数组的长度和 validcellValues 数组的长度
    const cellValuesLength = cellValues.length;
    const validcellValuesLength = validcellValues.length;

    // 计算validcellValues需要填充的数量
    const repeatCount = Math.ceil(cellValuesLength / validcellValuesLength);

    // 声明用于重复的数组
    const repeatedValidcellValues = [];

    // 面片为三个点一组
    // 将 validcellValues 数组重复添加到 repeatedValidcellValues 中，直到长度足够填满 cellValues 数组
    if ((cellValuesLength - validcellValuesLength) % 4 == 0){
        for (let i = 0; i < repeatCount; i++) {
            repeatedValidcellValues.push(...validcellValues);
        }
    }
    // console.log('f-repeat', repeatedValidcellValues);

    // 截取 repeatedValidcellValues 数组，使其长度与 cellValues 数组相同
    const truncatedValidcellValues = repeatedValidcellValues.slice(0, cellValues.length);
    // console.log('f-trun', truncatedValidcellValues);

    // // 将 cellValues 数组中的值替换为 truncatedValidcellValues 中的值
    // for (let i = 0; i < cellValues.length; i++) {
    //     ChangedcellValues[i] = truncatedValidcellValues[i];
    // }

    // copiedtoothPolyDatas[toothName].getPolys().setData(cellValues);
    
    // return {
    //     pointValues,
    //     cellValues,
    //     copiedtoothPolyDatas,
    //     validpointValues,
    //     validcellValues,
    // }
    return {
        pointValues,
        cellValues,
        truncatedValidcellValues,
    }
}

function generateEveryTooth(toothName, toothPolyDatas, store){
    const pointValues = toothPolyDatas[toothName].getPoints().getData();
    const cellValues = toothPolyDatas[toothName].getPolys().getData();
    const polydata = vtkPolyData.newInstance();
    const points = vtkPoints.newInstance();
    points.setData(Float32Array.from(pointValues));
    polydata.setPoints(points);

    const cellArray = vtkCellArray.newInstance();
    const cellData = new Uint32Array(cellValues);
    cellArray.setData(cellData);

    polydata.setPolys(cellArray);

    const mapper = vtkMapper.newInstance();
    mapper.setInputData(polydata);

    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    actor.getProperty().setColor(1, 1, 1);
    // actor.getProperty().setColor(0, 0, 0);
    // Tuneactor.getProperty().setColor(colorConfig.teeth);
    actor.getProperty().setOpacity(store.state.actorHandleState.toothOpacity);
    // Tuneactor.getProperty().setOpacity(toothOpacity/100);

    return actor;
}

function generateToothBox(
    SurroundingBoxsPoints,
    position,
    currentSelectBracket,
    SingleTooth0, SingleTooth1, SingleTooth2,
) {
    // toothPolyDatas,
    let resetTooth = [];
    // // 坐标系
    // const x_axis = store.state.actorHandleState.BoxSlicing.boxPositionAdjust.x_axis;
    // const y_axis = store.state.actorHandleState.BoxSlicing.boxPositionAdjust.y_axis;
    // const z_axis = store.state.actorHandleState.BoxSlicing.boxPositionAdjust.z_axis;
    // 包围框八个点
    // const SurroundingBoxsPoints = store.state.actorHandleState.BoxSlicing.boxPositionAdjust.BoxPoints;
    // const SurroundingBoxsPoints = store.state.actorHandleState.BoxSlicing.boxPositionAdjust.BoxPoints;
    const point0 = SurroundingBoxsPoints.Point0;
    const point1 = SurroundingBoxsPoints.Point1;
    const point2 = SurroundingBoxsPoints.Point2;
    const point3 = SurroundingBoxsPoints.Point3;
    const point4 = SurroundingBoxsPoints.Point4;
    const point5 = SurroundingBoxsPoints.Point5;
    const point6 = SurroundingBoxsPoints.Point6;
    const point7 = SurroundingBoxsPoints.Point7;

    // 单个牙齿的数据
    const ToothName = currentSelectBracket.name; // 选中牙齿名称
    // const SingleTooth = toothPolyDatas[ToothName].getPoints(); // 选中牙齿数据
    // const numPoints = SingleTooth.getNumberOfPoints();

    // 计算牙齿是否在包围框左面的右面
    // 分为两种情况：上牙和下牙
    // 上牙情况下
    // 左平面向量
    // if (position == 'upper'){
    //     const leftv1 = vectorSubtract(point2, point1);
    //     const leftv2 = vectorSubtract(point5, point1);
    //     const crossProductleft = crossProduct(leftv1, leftv2);
    //     const rightv1 = vectorSubtract(point3, point0);
    //     const rightv2 = vectorSubtract(point4, point0);
    //     const crossProductright = crossProduct(rightv1, rightv2);
    //     for (let idx = 0; idx < numPoints; idx++){
    //         const point = [0, 0, 0];
    //         SingleTooth.getPoint(idx, point)
    //         const leftv3 = vectorSubtract(point, point1);
    //         const dotProductleft = dotProduct(crossProductleft, leftv3);
    //         const rightv3 = vectorSubtract(point, point0);
    //         const dotProductright = dotProduct(crossProductright, rightv3);
    //         if (dotProductleft >= 0 && dotProductright <= 0){
    //             // 符合要求
    //             resetTooth.push(point);
    //         }
    //     }
    // }
    if (position == 'upper'){
        const leftv1 = vectorSubtract(point2, point1);
        const leftv2 = vectorSubtract(point5, point1);
        const crossProductleft = crossProduct(leftv1, leftv2);
        const rightv1 = vectorSubtract(point3, point0);
        const rightv2 = vectorSubtract(point4, point0);
        const crossProductright = crossProduct(rightv1, rightv2);
        const leftv3 = vectorSubtract(SingleTooth0, point1);
        const dotProductleft = dotProduct(crossProductleft, leftv3);
        const rightv3 = vectorSubtract(SingleTooth0, point0);
        const dotProductright = dotProduct(crossProductright, rightv3);
        if (dotProductleft >= 0 && dotProductright <= 0){
            const leftv3 = vectorSubtract(SingleTooth1, point1);
            const dotProductleft = dotProduct(crossProductleft, leftv3);
            const rightv3 = vectorSubtract(SingleTooth1, point0);
            const dotProductright = dotProduct(crossProductright, rightv3);
            if (dotProductleft >= 0 && dotProductright <= 0){
                const leftv3 = vectorSubtract(SingleTooth2, point1);
                const dotProductleft = dotProduct(crossProductleft, leftv3);
                const rightv3 = vectorSubtract(SingleTooth2, point0);
                const dotProductright = dotProduct(crossProductright, rightv3);
                if (dotProductleft >= 0 && dotProductright <= 0){
                    return true;
                }
                else return false;
            }
            else return false;
        }
        else return false;  
        // for (let idx = 0; idx < 3; idx++){
        //     const leftv3 = vectorSubtract(point, point1);
        //     const dotProductleft = dotProduct(crossProductleft, leftv3);
        //     const rightv3 = vectorSubtract(point, point0);
        //     const dotProductright = dotProduct(crossProductright, rightv3);
        //     if (dotProductleft >= 0 && dotProductright <= 0){
        //         // 符合要求
        //         resetTooth.push(point);
        //     }
        // }
    }
    if(position == 'lower'){
        // const leftv1 = vectorSubtract(point3, point0);
        // const leftv2 = vectorSubtract(point4, point0);
        // const crossProductleft = crossProduct(leftv1, leftv2);
        // const rightv1 = vectorSubtract(point2, point1);
        // const rightv2 = vectorSubtract(point5, point1);
        // const crossProductright = crossProduct(rightv1, rightv2);
        // const leftv3 = vectorSubtract(SingleTooth0, point0);
        // const dotProductleft = dotProduct(crossProductleft, leftv3);
        // const rightv3 = vectorSubtract(SingleTooth0, point1);
        // const dotProductright = dotProduct(crossProductright, rightv3);
        // if (dotProductleft >= 0 && dotProductright <= 0){
        //     const leftv3 = vectorSubtract(SingleTooth1, point0);
        //     const dotProductleft = dotProduct(crossProductleft, leftv3);
        //     const rightv3 = vectorSubtract(SingleTooth1, point1);
        //     const dotProductright = dotProduct(crossProductright, rightv3);
        //     if (dotProductleft >= 0 && dotProductright <= 0){
        //         const leftv3 = vectorSubtract(SingleTooth2, point0);
        //         const dotProductleft = dotProduct(crossProductleft, leftv3);
        //         const rightv3 = vectorSubtract(SingleTooth2, point1);
        //         const dotProductright = dotProduct(crossProductright, rightv3);
        //         if (dotProductleft >= 0 && dotProductright <= 0){
        //             return true;
        //         }
        //         else return false;
        //     }
        //     else return false;
        // }

        const leftv1 = vectorSubtract(point2, point1);
        const leftv2 = vectorSubtract(point5, point1);
        const crossProductleft = crossProduct(leftv1, leftv2);
        const rightv1 = vectorSubtract(point3, point0);
        const rightv2 = vectorSubtract(point4, point0);
        const crossProductright = crossProduct(rightv1, rightv2);
        const leftv3 = vectorSubtract(SingleTooth0, point1);
        const dotProductleft = dotProduct(crossProductleft, leftv3);
        const rightv3 = vectorSubtract(SingleTooth0, point0);
        const dotProductright = dotProduct(crossProductright, rightv3);
        if (dotProductleft >= 0 && dotProductright <= 0){
            const leftv3 = vectorSubtract(SingleTooth1, point1);
            const dotProductleft = dotProduct(crossProductleft, leftv3);
            const rightv3 = vectorSubtract(SingleTooth1, point0);
            const dotProductright = dotProduct(crossProductright, rightv3);
            if (dotProductleft >= 0 && dotProductright <= 0){
                const leftv3 = vectorSubtract(SingleTooth2, point1);
                const dotProductleft = dotProduct(crossProductleft, leftv3);
                const rightv3 = vectorSubtract(SingleTooth2, point0);
                const dotProductright = dotProduct(crossProductright, rightv3);
                if (dotProductleft >= 0 && dotProductright <= 0){
                    return true;
                }
                else return false;
            }
            else return false;
        }
        else return false;  
        // for (let idx = 0; idx < numPoints; idx++){
        //     const point = [0, 0, 0];
        //     SingleTooth.getPoint(idx, point)
        //     const leftv3 = vectorSubtract(point, point0);
        //     const dotProductleft = dotProduct(crossProductleft, leftv3);
        //     const rightv3 = vectorSubtract(point, point1);
        //     const dotProductright = dotProduct(crossProductright, rightv3);
        //     if (dotProductleft >= 0 && dotProductright <= 0){
        //         // 符合要求
        //         resetTooth.push(point);
        //     }
        // }
    }
    // return resetTooth
    return false
}



export {FineTunePiece, generateEveryTooth};