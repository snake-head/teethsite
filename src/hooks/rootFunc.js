import {
    add,
    cross,
    multiplyScalar,
    normalize,
    subtract,
} from "@kitware/vtk.js/Common/Core/Math";
import vtkRootHandleRepresentation from "../reDesignVtk/rootHandleWidget/RootHandleRepresentation";
import rootHandleWidget from "../reDesignVtk/rootHandleWidget";
import { reactive, computed, watch, inject } from "vue";
import { useStore } from "vuex";

export default function(allActorList,toothPolyDatas,longAxisData) {
    const store = useStore();
    /**
     * @description: 生成牙根方向actor
     * @return {*}
     * @author: ZhuYichen
     */
    function generateRootDirection(){
        for(let teethType of ["upper", "lower"]){
            if(!allActorList[teethType].root.length){
                handleRootActorDatas(teethType)
            }
        }
    }

    /**
     * @description 根据给出数据构造牙根方向
     * @param teethType upper | lower
     */
    function handleRootActorDatas(teethType) {
        for(let toothName in toothPolyDatas){
            if(toothName[0].toLowerCase()==teethType[0]){
                const bounds = toothPolyDatas[toothName].getBounds()
                const rootTopPoint = [
                    (bounds[0]+bounds[1])/2,
                    (bounds[2]+bounds[3])/2,
                    (bounds[4]+bounds[5])/2,
                ] //牙根底部点坐标
                const upNormal = []
                subtract(longAxisData[toothName].endPoint,longAxisData[toothName].startPoint,upNormal)
                normalize(upNormal)
                const rootBottomPoint = [] //牙根顶部点坐标
                add(rootTopPoint, multiplyScalar(upNormal, 7), rootBottomPoint)
                const rootRadius = Math.min(bounds[1]-bounds[0],bounds[3]-bounds[2])/4
                const radiusNormal = [] //半径方向
                cross(upNormal, [0,1,0], radiusNormal)
                normalize(radiusNormal)
                const rootRadiusNormal = [] //牙根半径点坐标
                add(rootBottomPoint, multiplyScalar(radiusNormal, rootRadius), rootRadiusNormal)

                //制造牙根底部、牙根顶部、牙根半径三个小球
                const rootRep = vtkRootHandleRepresentation.newInstance({
                    rootInitValue: {
                        bottomSphereCenter: rootBottomPoint,
                        topSphereCenter: rootTopPoint,
                        radiusSphereCenter: rootRadiusNormal,                },
                });
                const rootWidget = rootHandleWidget.newInstance({
                    allowHandleResize: 1,
                    widgetRep: rootRep,
                });
                allActorList[teethType].root.push({
                    toothName,
                    rootRep,
                    rootWidget,
                })
            }
        }
    }

    const dentalArchAdjustType = computed(() => store.state.actorHandleState.teethArrange.dentalArchAdjustRecord.teethType);
    /**
     * @description: 
     * @param {*} mode 操作
     * @param {*} vtkContext 传递renderWindow
     * @return {*}
     * @author: ZhuYichen
     */
    function adjustRootWidgetInScene(mode,vtkContext) {
        let selectedTeethType = dentalArchAdjustType.value;
        switch (mode) {
            case "enter": {
                allActorList[selectedTeethType].root.forEach(({ rootWidget }) => {
                    rootWidget.setInteractor(vtkContext.renderWindow.getInteractor());
                    rootWidget.setEnabled(true);
                });
                break;
            }
            case "exit": {
                allActorList[selectedTeethType].root.forEach(({ rootWidget }) => {
                    rootWidget.setEnabled(false);
                });
                break;
            }
            case "switch": {
                for(let teethType of ['upper','lower']){
                    if (teethType === selectedTeethType) {
                        allActorList[teethType].root.forEach(({ rootWidget }) => {
                            rootWidget.setInteractor(vtkContext.renderWindow.getInteractor());
                            rootWidget.setEnabled(true);
                        });
                    } else {
                        allActorList[teethType].root.forEach(({ rootWidget }) => {
                            rootWidget.setEnabled(false);
                        });
                    }
                }
                break;
            }
        }

        // 相机可显示距离调整, 防止截断
        vtkContext.renderer.getActiveCamera().setClippingRange(1, 1000);
        vtkContext.renderWindow.render();
    }

    function setTeethOpacity(opacity){
        for(let teethType of ["upper", "lower"]){
            allActorList[teethType].teethWithGingiva.actor.getProperty().setOpacity(opacity)
            allActorList[teethType].tooth.forEach(({actor})=>{
                actor.getProperty().setOpacity(opacity)
            })
        }
    }

    return {
        generateRootDirection,
        adjustRootWidgetInScene,
        setTeethOpacity,
    }
}