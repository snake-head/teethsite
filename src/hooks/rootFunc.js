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
import {
    setTokenHeader,
    setUserIdHeader,
    sendRequestWithToken,
} from "../utils/tokenRequest";
import XML from '@kitware/vtk.js/IO/XML';
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";


export default function(allActorList,toothPolyDatas,bracketData) {
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
                var upNormal = [];
                // 使用托槽z轴方向作为牙根方向
                bracketData[teethType].forEach((bracket)=>{
                    if(bracket.name==toothName){
                        upNormal = [...bracket.direction.left]
                    }
                })
                const bounds = toothPolyDatas[toothName].getBounds()
                const rootTopPoint = [
                    (bounds[0]+bounds[1])/2,
                    (bounds[2]+bounds[3])/2,
                    (bounds[4]+bounds[5])/2,
                ] //牙根底部点坐标
                // const upNormal = []
                // subtract(longAxisData[toothName].endPoint,longAxisData[toothName].startPoint,upNormal)
                // normalize(upNormal)
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

    function setGingivaOpacity(opacity, typeList=["upper", "lower"]){
        for(let teethType of typeList){
            allActorList[teethType].teethWithGingiva.actor.getProperty().setOpacity(opacity)
        }
    }

    async function generateRoot(teethType) {
        let rootList = [];
        let originRootList = [];
        const promises = []; // 存储每个请求的 Promise 对象
      
        Object.entries(toothPolyDatas).forEach(([toothName, toothPolyData]) => {
          if (toothName[0].toLowerCase() === teethType[0]) {
            let writer = XML.vtkXMLPolyDataWriter.newInstance();
            let polyDataAsString = writer.write(toothPolyData);
            const { rootRep } = allActorList[teethType].root.filter(
              (obj) => obj.toothName == toothName
            )[0];
            const rootInfo = {
              toothName,
              bottomSphereCenter: rootRep.getCenters()[0],
              topSphereCenter: rootRep.getCenters()[1],
              radiusSphereCenter: rootRep.getCenters()[2],
            };
            const jsonPart = JSON.stringify(rootInfo);
      
            let formData = new FormData();
            formData.append("polyData", new Blob([polyDataAsString], { type: "text/xml" }));
            formData.append("jsonPart", new Blob([jsonPart], { type: "application/json" }));
      
            const generateRootPath = "/backend/generate_root/";
      
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
                    const arrayBuffer = base64ToArrayBuffer(resp.data.polydata);
                    const originArrayBuffer = arrayBuffer.slice(); // Perform a deep copy of arrayBuffer
                    const reader = XML.vtkXMLPolyDataReader.newInstance();
                    reader.parseAsArrayBuffer(arrayBuffer);
                    const polyData = reader.getOutputData(0);
                    const mapper = vtkMapper.newInstance();
                    mapper.setInputData(polyData);
                    const actor = vtkActor.newInstance();
                    actor.setMapper(mapper);
                    rootList.push({ name: toothName, actor, mapper });

                    // Process the deep copy of polydata
                    const originReader = XML.vtkXMLPolyDataReader.newInstance();
                    originReader.parseAsArrayBuffer(originArrayBuffer);
                    const originPolyData = originReader.getOutputData(0);
                    const originMapper = vtkMapper.newInstance();
                    originMapper.setInputData(originPolyData);
                    const originActor = vtkActor.newInstance();
                    originActor.setMapper(originMapper);
                    originRootList.push({ name: toothName, actor: originActor, mapper: originMapper });
                    resolve(); // 请求成功，resolve
                })
                .catch((error) => {
                  console.log("error");
                  reject(error); // 请求失败，reject
                });
            });
      
            promises.push(promise); // 将每个请求的 Promise 对象添加到数组中
          }
        });
      
        await Promise.all(promises); // 等待所有请求完成
        return { rootList, originRootList };
      }

    function base64ToArrayBuffer(base64) {
        const binaryString = window.atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    function clearRoot(rootList){
        rootList.forEach(({actor})=>{
            renderer.removeActor(actor)
        })
    }

    return {
        generateRootDirection,
        adjustRootWidgetInScene,
        setGingivaOpacity,
        generateRoot,
        clearRoot,
    }
}