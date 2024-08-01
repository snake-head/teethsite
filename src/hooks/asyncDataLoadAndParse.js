import { onMounted, reactive, ref, watch, computed } from "vue";
import { DEFAULT_PATIENTUID, bracketNameList, rotateConfigList } from "../static_config";
import { useRoute } from "vue-router";
import { useStore } from "vuex";
import { projectToAxis } from "../utils/bracketFineTuneByTypedArray";
import { colorConfig as actorColorConfig } from "./actorControl";

import vtkCutter from "@kitware/vtk.js/Filters/Core/Cutter";
import vtkPlane from "@kitware/vtk.js/Common/DataModel/Plane";
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import vtkProperty from "@kitware/vtk.js/Rendering/Core/Property";
import { normalize, cross, subtract, multiplyScalar, add } from "@kitware/vtk.js/Common/Core/Math";

import vtkImageMapper from "@kitware/vtk.js/Rendering/Core/ImageMapper";
import vtkImageSlice from "@kitware/vtk.js/Rendering/Core/ImageSlice";
import vtkImageHelper from "@kitware/vtk.js/Common/Core/ImageHelper";
// import vtkHandleWidget from "../reDesignVtk/reDesignHandleWidget";
// import vtkSphereHandleRepresentation from "../reDesignVtk/reDesignSphereHandleRepresentation";
import Constants from "@kitware/vtk.js/Rendering/Core/ImageMapper/Constants";
import distanceLineControl from "./distanceLineControl";
import {
    invertMatrix4x4,
} from "./userMatrixControl";
import { browserType } from "../utils/browserTypeDetection";

const { SlicingMode } = Constants;

import DataLoadAndParseWorker from "./dataLoadAndParse.worker";
import vtkPolyData from "@kitware/vtk.js/Common/DataModel/PolyData";
import {
    setTokenHeader,
    setUserIdHeader,
    getRequestWithToken,
    sendRequestWithToken,
} from "../utils/tokenRequest";
// import vtkRootHandleRepresentation from "../reDesignVtk/rootHandleWidget/RootHandleRepresentation";
// import rootHandleWidget from "../reDesignVtk/rootHandleWidget";

import vtkBracketWidget from '../reDesignVtk/Widgets/Widgets3D/BracketWidget'
import vtkSphereWidget from '../reDesignVtk/Widgets/Widgets3D/SphereWidget';
import vtkRootWidget from '../reDesignVtk/Widgets/Widgets3D/RootWidget';


export default function(vtkTextContainer, userMatrixList, applyCalMatrix) {
    const {
        distanceMessageList,
        initDistanceMessageList,
        initDistanceLineWithData,
        updateDistanceLine,
    } = distanceLineControl();
    const store = useStore();

    let patientUID = ref(DEFAULT_PATIENTUID);
    let authConfig = { token: "", id: "" };

    let allActorList = {
        upper: {
            // 上颌牙
            teethWithGingiva: {}, // 牙龈
            originGingiva: {},
            tooth: [], // 每颗分割牙齿的name, actor, mapper(如果隐藏牙龈则选择此actor)
            originTooth: [], //2023.4.11更新，需要能够同时显示排牙前后的牙齿，用于保存原始牙列
            bracket: [], // 每个托槽的name, actor, mapper
            originBracket: [],
            toothAxis: [], // 每颗分割牙齿的name, 坐标轴actors列表
            distanceLine: [], // 距离计算线(改变选择托槽时进行调整)
            arch: {}, // 牙弓线(每次重新排牙都会更新)
            teethAxisSphere: {}, // 牙齿标准坐标系(首次排牙完成后创建, 在调整上颌位置时显示)
            OBB: {},
            root: [], // 牙根圆锥
            rootGenerate: [], //生成的牙根
            originRoot: [], //和原始牙列位置相匹配的牙根
        },
        lower: {
            // 下颌牙
            teethWithGingiva: {}, // 牙龈
            originGingiva: {},
            tooth: [], // 每颗分割牙齿的name, actor, mapper(如果隐藏牙龈则选择此actor)
            originTooth: [], //2023.4.11更新，需要能够同时显示排牙前后的牙齿，用于保存原始牙列
            bracket: [], // 每个托槽的name, actor, mapper
            originBracket: [],
            toothAxis: [], // 每颗分割牙齿的name, 坐标轴actors列表
            distanceLine: [], // 距离计算线
            arch: {}, // 牙弓线(每次重新排牙都会更新)
            teethAxisSphere: {}, // 牙齿标准坐标系(首次排牙完成后创建, 在调整下颌位置时显示)
            OBB: {},
            root: [], // 牙根圆锥
            rootGenerate: [], //生成的牙根
            originRoot: [], //和原始牙列位置相匹配的牙根
        },
        picture: null,
        intersection: null
    }; // 全部actor

    let progressConfig = reactive({
        upper: {
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
                    message: "正在请求上颌牙模型路径......",
                    type: "wait",
                    progress: "",
                },
            },
            3: {
                // 下载牙齿模型
                state: {
                    message: "正在下载上颌牙模型......",
                    type: "wait",
                    progress: "0.0%",
                },
            },
            4: {
                // 读取牙齿模型数据
                state: {
                    message: "正在读取上颌牙模型下载数据......",
                    type: "wait",
                    progress: "",
                },
            },
            5: {
                // 解析CADO文件 + 读取所需托槽下载地址
                state: {
                    message: "正在读取上颌牙所需托槽路径......",
                    type: "wait",
                    progress: "",
                },
            },
            6: {
                // 下载托槽数据
                state: {
                    message: "正在下载上颌牙托槽......",
                    type: "wait",
                    progress: "",
                },
            },
            7: {
                // 解析托槽文件并存入stlObj
                state: {
                    message: "正在解析上颌牙托槽......",
                    type: "wait",
                    progress: "0/28",
                },
            },
            8: {
                // ViewerMain中操作, generateTeethActor('upper'), 生成对应actor
                state: {
                    message: "正在制造上颌牙模型......",
                    type: "wait",
                    progress: "",
                },
            },
            // 制造轴线actor
            9: {
                state: {
                    message: "正在制造上颌牙轴线模型......",
                    type: "wait",
                    progress: "",
                },
            },
            // 制造牙根actor
            10: {
                state: {
                    message: "正在制造虚拟牙根模型......",
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
        },
        lower: {
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
                    message: "正在请求下颌牙模型路径......",
                    type: "wait",
                    progress: "",
                },
            },
            3: {
                // 下载牙齿模型
                state: {
                    message: "正在下载下颌牙模型......",
                    type: "wait",
                    progress: "0.0%",
                },
            },
            4: {
                // 读取牙齿模型数据
                state: {
                    message: "正在读取下颌牙模型下载数据......",
                    type: "wait",
                    progress: "",
                },
            },
            5: {
                // 解析CADO文件 + 读取所需托槽下载地址
                state: {
                    message: "正在读取下颌牙所需托槽路径......",
                    type: "wait",
                    progress: "",
                },
            },
            6: {
                // 下载托槽数据
                state: {
                    message: "正在下载下颌牙托槽......",
                    type: "wait",
                    progress: "",
                },
            },
            7: {
                // 解析托槽文件并存入stlObj
                state: {
                    message: "正在解析下颌牙托槽......",
                    type: "wait",
                    progress: "0/28",
                },
            },
            8: {
                // ViewerMain中操作, generateTeethActor('lower'), 生成对应actor
                state: {
                    message: "正在制造下颌牙模型......",
                    type: "wait",
                    progress: "",
                },
            },
            // 制造轴线actor
            9: {
                state: {
                    message: "正在制造上颌牙轴线模型......",
                    type: "wait",
                    progress: "",
                },
            },
            // 制造牙根actor
            10: {
                state: {
                    message: "正在制造虚拟牙根模型......",
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
        },
        picture: {
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
                    message: "正在请求全景图路径......",
                    type: "wait",
                    progress: "",
                },
                picturePath: "",
            },
            2: {
                // 下载牙齿模型
                state: {
                    message: "正在下载全景图......",
                    type: "wait",
                    progress: "0.0%",
                },
                picture: null,
            },
        },
    });
    let currentStep = reactive({
        upper: 0,
        lower: 0,
        picture: 0,
    });

    // 输出数据
    let stlObj = reactive({
        teeth: {
            upper: null, // 上颌牙模型文件
            lower: null, // 下颌牙模型文件
        },
        bracket: {
            upper: [], // 上颌牙矫正托槽模型文件(14个)
            lower: [], // 下颌牙矫正托槽模型文件(14个)
        },
    });
    let xmlObj = reactive({
        upper: undefined,
        lower: undefined,
    }); // 信息文件

    let bracketPolyDatas = {}; // 存放托槽的polyData
    let toothPolyDatas = {}; // 存放单牙齿的polyData,用于后续每个牙齿上坐标轴的建立源
    let toothBoxPoints = {}; //存放牙齿的牙齿Box点

    let mainCameraConfigs = {
        upper: null,
        lower: null,
    }; // 保存camera设置
    let bracketData = {
        upper: [],
        lower: [],
    }; // 全部托槽的name,direction,position,fineTuneRecord(微调,镜头定位专用)

    let longAxisData = {}; // 存放各个牙齿的长轴的3个点
    // 全景图流程
    watch(
        () => currentStep.picture,
        (newval) => {
            switch (newval) {
                case 1: {
                    queryPicturePath(
                        window.linkConfig.modelDownloadLinkQueryFullApi
                            .replace("#param_patientUID#", patientUID.value)
                            .replace("#param_modelType#", "PictureFile")
                        // window.linkConfig.modelDownloadLinkQueryApi + '?patientUid={' + patientUID.value + '}&modelType=PictureFile',
                    );
                    break;
                }
                case 2: {
                    downloadPicture();
                    break;
                }
                case 3: {
                    handlePicture();
                    break;
                }
            }
        }
    );

    // 开局step01
    onMounted(() => {
        resize(); // 初始化画布大小
        window.addEventListener("resize", resize); // 添加窗口大小调整时自动调整画布大小
        initDistanceMessageList();
        initRotateMessageList();
        startProgress();
    });

    let rotateMessageList = reactive([]);
    /**
     * @description: 初始化转矩表格，用于在右侧转矩tab页上进行显示
     * @return {*}
     * @author: ZhuYichen
     */
    function initRotateMessageList(){
        for (let i = 0; i < 7; i++) {
            rotateMessageList.push([]); // 共7列数据
        }
        bracketNameList.forEach((name, index) => {
            const rowId = index % 4; // 第几行 0123
            const colId = Math.floor(index / 4); // 第几列 01234567
            rotateMessageList[colId].push({
                name,
                key: index,
                rowId,
                colId,
                rotate: undefined, //从配置文件中读取到的初始转矩
                plus: 0, //转矩增减量
            });
        });
    }

    // textCanvas默认大小300*150, 需要手动修改
    function resize() {
        const dims = vtkTextContainer.value.getBoundingClientRect();
        vtkTextContainer.value.setAttribute("width", dims.width);
        vtkTextContainer.value.setAttribute("height", dims.height);
    }

    // step0+step1
    function startProgress() {
        const route = useRoute();
        // 开始初始的自动流程
        // 初始值
        currentStep.upper = 0;
        currentStep.lower = 0;

        // 检测patientUID
        if (route.query.patientUID === DEFAULT_PATIENTUID) {
            progressConfig.upper["0"].state.message =
                "请在地址栏中输入正确的病人UID！";
            progressConfig.upper["0"].state.type = "error";
            progressConfig.lower["0"].state.message =
                "请在地址栏中输入正确的病人UID！";
            progressConfig.lower["0"].state.type = "error";
            return;
        }
        patientUID.value = route.query.patientUID;
        authConfig.token = route.query.token;
        authConfig.id = route.query.user;
        setTokenHeader(route.query.token);
        setUserIdHeader(route.query.user);
        // patientUID检测成功
        currentStep.upper++;
        currentStep.lower++;

        // 改用token方式, 此处保持未登录状态, 后续所有操作使用token获取资源
        getCurrentLoginUser(); // step1-1
    }

    const userId = computed(() => store.state.userHandleState.userId);
    /**
     * @description step1-1 获取当前登录用户名, 如果login/没有登录则是用token登录, 用户名在地址栏中, 如果是正常登录方式则login/能直接取得信息
     */
    function getCurrentLoginUser() {
        progressConfig.upper["1"].state.message = "正在检查登录状态......";
        progressConfig.lower["1"].state.message = "正在检查登录状态......";
        sendRequestWithToken({
            method: "GET",
            url: window.linkConfig.login,
        }).then((resp) => {
            if (resp.data.data.state === "SUCCESS") {
                // 正常登录方式则login/能直接取得信息
                store.dispatch(
                    "userHandleState/updateUserId",
                    resp.data.data.userInfo.userId
                );

            }
            if (authConfig.id){
                // login/没有登录则是用token登录, 用户名在地址栏中
                store.dispatch("userHandleState/updateUserId", authConfig.id);
            }
            getIfRollBackAuthorized(); // step1-2
            getUserThemeType(userId.value); // step1-2-2
        });
    }

    /**
     * @description step1-2 获取该用户能否进行撤回操作的权限
     */
    function getIfRollBackAuthorized() {
        progressConfig.upper["1"].state.message = "正在核对用户权限......";
        progressConfig.lower["1"].state.message = "正在核对用户权限......";
        sendRequestWithToken({
            method: "GET",
            url: window.linkConfig.rollbackDataApi,
        }).then((resp) => {
            if (resp.data.data?.includes?.("pass")) {
                store.dispatch("userHandleState/updateUserType", "MANAGER");
            } else {
                store.dispatch("userHandleState/updateUserType", "NORMAL");
            }
            getIfDataIsChecked(); // step 1-3
        });
    }

    /**
     * @description step1-2-2 获取该用户的主题
     */
    function getUserThemeType(userId) {
        progressConfig.upper["1"].state.message = "正在获取主题类型......";
        progressConfig.lower["1"].state.message = "正在获取主题类型......";
        // 根据接口要求，必须传入count和index才会返回详细信息
        sendRequestWithToken({
            method: "GET",
            url: window.linkConfig.userInfoQueryApi.replace(
                "#param_userID#",
                userId
            ).replace(
                "#user_count#",
                1
            ).replace(
                "#index#",
                0
            ),
        }).then((resp) => {
            if(resp.data.data[0].webtheme==1){
                store.dispatch("userHandleState/updateThemeType", "new");
                const currentBaseUrl = process.env.BASE_URL;
                const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
                link.type = 'image/x-icon';
                link.rel = 'icon';
                link.href = currentBaseUrl + 'logo.ico';
          
                // 添加或更新<link>元素到<head>中
                const head = document.head || document.getElementsByTagName('head')[0];
                head.appendChild(link);
            }else{
                store.dispatch("userHandleState/updateThemeType", "origin");
            }
        });
    }
    /**
     * @description step1-3 是否该数据已经确认，是则用户无法再修改(该此为首次资源请求)
     */
    function getIfDataIsChecked() {
        progressConfig.upper["1"].state.message = "正在检索病例信息......";
        progressConfig.lower["1"].state.message = "正在检索病例信息......";
        sendRequestWithToken({
            method: "GET",
            url: window.linkConfig.patientInfoQueryApi.replace(
                "#param_patientUID#",
                patientUID.value
            ),
        }).then(
            (resp) => {
                if (resp.data === "ERROR") {
                    // 首次请求检测令牌有效性
                    progressConfig.upper["1"].state.message =
                        "获取病人数据失败！";
                    progressConfig.upper["1"].state.type = "error";
                    progressConfig.lower["1"].state.message =
                        "获取病人数据失败！";
                    progressConfig.lower["1"].state.type = "error";
                } else if (!resp.data.data?.count) {
                    progressConfig.upper["1"].state.message =
                        "获取病人数据失败！";
                    progressConfig.upper["1"].state.type = "error";
                    progressConfig.lower["1"].state.message =
                        "获取病人数据失败！";
                    progressConfig.lower["1"].state.type = "error";
                } else {
                    // 不确定是否有括号
                    let matchPatientsInfo = resp.data.data.patientList.filter(
                        (pInfo) => pInfo.uid === patientUID.value
                    );
                    if (matchPatientsInfo.length === 0) {
                        progressConfig.upper["1"].state.message =
                            "获取病人数据失败！";
                        progressConfig.upper["1"].state.type = "error";
                        progressConfig.lower["1"].state.message =
                            "获取病人数据失败！";
                        progressConfig.lower["1"].state.type = "error";
                    } else {
                        matchPatientsInfo = matchPatientsInfo[0];
                        store.dispatch(
                            "userHandleState/updatePatientName",
                            matchPatientsInfo.name
                        );
                        store.dispatch(
                            "userHandleState/updatePatientBelongUserId",
                            matchPatientsInfo.userId
                        )
                        // 备注后6位是订单id，只有VIPMMM001有
                        store.dispatch(
                            "userHandleState/updateOrderId",
                            matchPatientsInfo.remarks.slice(-7, -1)
                        );
                        store.dispatch(
                            "userHandleState/updateDataCheckedState",
                            {
                                teethType: "upper",
                                value: matchPatientsInfo.UpperUserCheck === 1,
                            }
                        );
                        store.dispatch(
                            "userHandleState/updateDataCheckedState",
                            {
                                teethType: "lower",
                                value: matchPatientsInfo.LowerUserCheck === 1,
                            }
                        );
                        store.dispatch(
                            "userHandleState/updateDataCheckableState",
                            {
                                teethType: "upper",
                                value: matchPatientsInfo.UpperUserCheckable === 1,
                            }
                        );
                        store.dispatch(
                            "userHandleState/updateDataCheckableState",
                            {
                                teethType: "lower",
                                value: matchPatientsInfo.LowerUserCheckable === 1,
                            }
                        );

                        // 注意其中的UpperProcessConfig,LowerProcessConfig, 如果是0则直接不要读
                        const handleTeethType = [];
                        if (matchPatientsInfo.UpperProcessConfig === 1) {
                            handleTeethType.push("upper");
                            currentStep.upper++;
                        } else {
                            progressConfig.upper["1"].state.message =
                                "上颌牙尚未到达该处理阶段......";
                            progressConfig.upper["1"].state.type = "deactive";
                        }
                        if (matchPatientsInfo.LowerProcessConfig === 1) {
                            handleTeethType.push("lower");
                            currentStep.lower++;
                        } else {
                            progressConfig.lower["1"].state.message =
                                "下颌牙尚未到达该处理阶段......";
                            progressConfig.lower["1"].state.type = "deactive";
                        }
                        if (handleTeethType.length > 0) {
                            currentStep.picture++;
                            startWorker(handleTeethType);
                        }
                    }
                }
            },
            (error) => {
                progressConfig.upper["1"].state.message = "获取病人数据失败！";
                progressConfig.upper["1"].state.type = "error";
                progressConfig.lower["1"].state.message = "获取病人数据失败！";
                progressConfig.lower["1"].state.type = "error";
            }
        );
    }

    /**
     * @description 传入sphereHandleRep内部, 在每次鼠标拖动长轴点时调用, 以更新外部的axisActor以及distanceLineActor
     * 注：坐标轴和长轴点共同显示隐藏
     * @param teethType "upper" | "lower" -> 初始化时传入sphereHandleRep
     * @param toothName 对应牙齿名称     ->初始化时传入sphereHandleRep
     * @param pointType "start" | "end"->初始化时传入sphereHandleRep
     * @param updatedPoint 距离更新完成的nearestPoint->调用时可传入
     * @param renderer 在viewerMain中初次渲染时使用setRenderWindow传入
     * @param renderWindow 在viewerMain中初次渲染时使用setRenderer传入
     */
    function updateLongAxisPoint(
        teethType,
        toothName,
        pointType,
        updatedPoint,
        renderer,
        renderWindow
    ) {
        // 读取托槽center和zNormal
        const {
            fineTuneRecord: {
                actorMatrix: { center, zNormal, xNormal },
            },
        } = bracketData[teethType].filter((item) => item.name === toothName)[0];
        // 读取牙齿polyData(切割源)
        const toothPolyData = toothPolyDatas[toothName];
        let axisMat = applyCalMatrix.tad[toothName]; // 读取当前牙齿的转换矩阵, 后续设置新的坐标轴
        if (!axisMat) {
            axisMat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
        }

        // 读取lineActorItem中的startPoint和endPoint
        let lineActorItem = findMatchDistanceLineItem(toothName);
        let { startPoint, endPoint } = lineActorItem;
        if (pointType === "start") {
            // 更新其中的startPoint(利用浅拷贝)
            startPoint[0] = updatedPoint[0];
            startPoint[1] = updatedPoint[1];
            startPoint[2] = updatedPoint[2];
        } else if (pointType === "end") {
            // 更新其中的endPoint(利用浅拷贝)
            endPoint[0] = updatedPoint[0];
            endPoint[1] = updatedPoint[1];
            endPoint[2] = updatedPoint[2];
        }
        // 改动任意一点都会影响长轴进而需要更新距离线(startPoint同时还影响距离线中的一个顶点)
        updateDistanceLineActor(
            toothName,
            center,
            zNormal,
            xNormal,
            renderer,
            renderWindow
        );
        // 获得更新后的坐标轴, 进行removeActor和addActor, 替换allActorslist中的actors
        const newCutActorList = getCutActorList(
            startPoint,
            endPoint,
            zNormal,
            toothPolyData,
            1
        );
        newCutActorList.forEach((actor) => {
            actor.setUserMatrix(axisMat);
        });

        const axisMatchItem = allActorList[teethType].toothAxis.filter(
            (val) => val.name === toothName
        )[0];
        // 所有旧的坐标轴, 是否在屏幕中
        let axisInScene = false;
        axisMatchItem.actors.forEach((actor) => {
            renderer.getActors().forEach((actorInScene) => {
                if (actor === actorInScene) {
                    axisInScene = true;
                }
            });
        });
        // 如果有坐标轴在屏幕中, 则移除旧的后换上新的
        if (axisInScene) {
            axisMatchItem.actors.forEach((actor) => {
                renderer.removeActor(actor);
            });
            newCutActorList.forEach((actor) => {
                renderer.addActor(actor);
            });
        }
        // 替换allActorslist中的actors
        axisMatchItem.actors = newCutActorList;
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
     * @param toothPolyData 牙齿PolyData
     * @param axisDist 选取点间距, 即平面间距, 即坐标轴间距
     */
    function getCutActorList(
        startPoint,
        endPoint,
        zNormal,
        toothPolyData,
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
        normalize(normal1); // 归一化模值
        const normal2 = [0, 0, 0];
        cross(zNormal, normal1, normal2);
        normalize(normal2); // 归一化模值
        // ----------------------------------
        // 计算每个平面上的点(均匀选取)
        // ----------------------------------
        // normal1Min, normal1Max, normal2Min, normal2Max
        const toothProjectionBound = [Infinity, -Infinity, Infinity, -Infinity];
        // 计算牙齿投影到normal1和normal2上的最大最小距离
        const toothPoints = toothPolyData.getPoints();
        const numPoints = toothPoints.getNumberOfPoints();
        for (let idx = 0; idx < numPoints; idx++) {
            const point = [0, 0, 0];
            toothPoints.getPoint(idx, point);
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
                Math.floor(
                    (proj1OfStartP - toothProjectionBound[0]) / axisDist
                );
        const originOfNormal1End =
            proj1OfStartP +
            axisDist *
                Math.floor(
                    (toothProjectionBound[1] - proj1OfStartP) / axisDist
                );
        const originOfNormal1NumStep =
            (originOfNormal1End - originOfNormal1Start) / axisDist + 1;

        const originOfNormal2Start =
            proj2OfStartP -
            axisDist *
                Math.floor(
                    (proj2OfStartP - toothProjectionBound[2]) / axisDist
                );
        const originOfNormal2End =
            proj2OfStartP +
            axisDist *
                Math.floor(
                    (toothProjectionBound[3] - proj2OfStartP) / axisDist
                );
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
        const actors = [];
        // 法向量：normal1
        // 点：originOfNormal1
        originOfNormal1.forEach((origin) => {
            const plane = vtkPlane.newInstance();
            plane.setOrigin(...origin);
            plane.setNormal(...normal1);

            const cutter = vtkCutter.newInstance();
            cutter.setCutFunction(plane); // 使用plane切割
            cutter.setInputData(toothPolyData); // 切割对象为牙齿polyData
            const mapper = vtkMapper.newInstance();
            mapper.setInputData(cutter.getOutputData());
            const cutActor = vtkActor.newInstance();
            cutActor.setMapper(mapper);
            cutActor
                .getProperty()
                .setRepresentation(vtkProperty.Representation.WIREFRAME); // 设置面片显示为网线框架结构
            cutActor.getProperty().setLighting(false);
            cutActor.getProperty().setColor(0, 0, 1);

            actors.push(cutActor);
        });
        originOfNormal2.forEach((origin, idx) => {
            const plane = vtkPlane.newInstance();
            plane.setOrigin(...origin);
            plane.setNormal(...normal2);
            const cutter = vtkCutter.newInstance();
            cutter.setCutFunction(plane); // 使用plane切割
            cutter.setInputData(toothPolyData); // 切割对象为牙齿polyData
            const mapper = vtkMapper.newInstance();
            mapper.setInputData(cutter.getOutputData());
            const cutActor = vtkActor.newInstance();
            cutActor.setMapper(mapper);
            cutActor
                .getProperty()
                .setRepresentation(vtkProperty.Representation.WIREFRAME); // 设置面片显示为网线框架结构
            cutActor.getProperty().setLighting(false);
            cutActor.getProperty().setColor(1, 0, 0);
            actors.push(cutActor);

            if (idx === longAxisIdx) {
                const offsets = [
                    [1e-4, 0, 0],
                    [-1e-4, 0, 0],
                    [0, 1e-4, 0],
                    [0, -1e-4, 0],
                    [0, 0, 1e-4],
                    [0, 0, -1e-4],

                    [0, 1e-4, 1e-4],
                    [0, 1e-4, -1e-4],
                    [0, -1e-4, 1e-4],
                    [0, -1e-4, -1e-4],
                    [1e-4, 0, 1e-4],
                    [1e-4, 0, -1e-4],
                    [-1e-4, 0, 1e-4],
                    [-1e-4, 0, -1e-4],
                    [1e-4, 1e-4, 0],
                    [1e-4, -1e-4, 0],
                    [-1e-4, 1e-4, 0],
                    [-1e-4, -1e-4, 0],

                    [1e-4, 1e-4, 1e-4],
                    [1e-4, 1e-4, -1e-4],
                    [1e-4, -1e-4, 1e-4],
                    [-1e-4, 1e-4, 1e-4],
                    [1e-4, -1e-4, -1e-4],
                    [-1e-4, 1e-4, -1e-4],
                    [-1e-4, -1e-4, 1e-4],
                    [-1e-4, -1e-4, -1e-4],
                ];
                // 加粗的土方法：在附近加线
                offsets.forEach((offset) => {
                    const cutActor = vtkActor.newInstance();
                    cutActor.setMapper(mapper);
                    cutActor
                        .getProperty()
                        .setRepresentation(
                            vtkProperty.Representation.WIREFRAME
                        );
                    cutActor.setScale(
                        1 + 2 * offset[0],
                        1 + 2 * offset[1],
                        1 + 2 * offset[2]
                    );
                    cutActor.getProperty().setColor(1, 0, 0);
                    actors.push(cutActor);
                });
            }
        });
        return actors;
    }

    /**
     * @description 在托槽微调时调用, 重置时也调用, 更新对应lineActor
     * 微调时直接用, 重置单个时直接用, 重置所有时读取当前选中托槽名称直接用
     * @param toothName 牙齿名称, 用于读取对应数据
     * @param center 托槽微调后中心
     * @param zNormal 托槽微调后zNormal
     * @param renderer 用于lineActor强制更新
     * @param renderWindow 用于lineActor强制更新
     */
    function updateDistanceLineActor(
        toothName,
        center,
        zNormal,
        xNormal,
        renderer,
        renderWindow
    ) {
        let lineActorItem = findMatchDistanceLineItem(toothName);
        if (lineActorItem === null) {
            return;
        }
        const pointValues = toothPolyDatas[toothName].getPoints().getData()
        const cellValues = toothPolyDatas[toothName].getPolys().getData()

        updateDistanceLine(
            lineActorItem,
            toothName,
            center,
            zNormal,
            xNormal,
            1.5,
            renderer,
            renderWindow,
            pointValues,
            cellValues
        );
    }
    function findMatchDistanceLineItem(toothName) {
        for (let teethType of ["upper", "lower"]) {
            let itemMatch = allActorList[teethType].distanceLine.filter(
                (item) => item.name === toothName
            );
            if (itemMatch.length > 0) {
                return itemMatch[0].lineActorItem;
            }
        }
        return null;
    }

    // 牙齿全景图step1
    function queryPicturePath(configApi) {
        const stepConfig = progressConfig.picture["1"];
        sendRequestWithToken({
            method: "GET",
            url: encodeURI(configApi),
        }).then(
            (resp) => {
                if (resp.data.data) {
                    stepConfig.picturePath =
                        window.linkConfig.modelDataQueryApi + resp.data.data;
                    currentStep.picture++;
                } else {
                    stepConfig.state.message = "请求全景图路径未返回有效数据！";
                    stepConfig.state.type = "error";
                }
            },
            (error) => {
                stepConfig.state.message = "未检测到全景图！";
                stepConfig.state.type = "error";
            }
        );
    }
    // 牙齿全景图step2
    function downloadPicture() {
        const { picturePath } = progressConfig.picture["1"];
        const stepConfig = progressConfig.picture["2"];
        const dlConfig = {
            responseType: "arraybuffer",
            onDownloadProgress: (e) => {
                stepConfig.state.progress =
                    Math.ceil((e.loaded / e.total) * 100) + "%";
            },
        };
        // axios.get(encodeURI(picturePath), dlConfig).then(
        //     resp => {
        //         // 构造image元素
        //         let byte = ''
        //         new Uint8Array(resp.data).forEach(val=>byte += String.fromCharCode(val))
        //         let base64 = 'data:image/jpeg;base64,' + window.btoa(byte)
        //         let image = new Image()
        //         image.src = base64
        //         image.onload = function() {
        //             // 转换为vtkImageData
        //             stepConfig.picture = vtkImageHelper.imageToImageData(image, {flipY: true})
        //             currentStep.picture++
        //         }
        //     },
        //     error => {
        //         stepConfig.state.message = "未检测到全景图！"
        //         stepConfig.state.progress = ''
        //         stepConfig.state.type = "error"
        //     }
        // )
        getRequestWithToken(encodeURI(picturePath), dlConfig).then(
            (resp) => {
                // 构造image元素
                let byte = "";
                new Uint8Array(resp.data).forEach(
                    (val) => (byte += String.fromCharCode(val))
                );
                let base64 = "data:image/jpeg;base64," + window.btoa(byte);
                let image = new Image();
                image.src = base64;
                image.onload = function() {
                    // 转换为vtkImageData
                    stepConfig.picture = vtkImageHelper.imageToImageData(
                        image,
                        { flipY: true }
                    );
                    currentStep.picture++;
                };
            },
            (error) => {
                stepConfig.state.message = "未检测到全景图！";
                stepConfig.state.progress = "";
                stepConfig.state.type = "error";
            }
        );
    }
    // 牙齿全景图step3
    function handlePicture() {
        const { picture } = progressConfig.picture["2"];
        if (picture) {
            const mapper = vtkImageMapper.newInstance();
            mapper.setInputData(picture);
            mapper.setSliceAtFocalPoint(true);
            mapper.setSlicingMode(SlicingMode.Z);

            const actor = vtkImageSlice.newInstance();
            actor.setMapper(mapper);

            allActorList.picture = { actor, mapper };

            currentStep.picture++;
        }
    }

    /**
     * @description 根据给出数据构造对应actor并保存
     * @param teethType upper | lower
     * @param actorDatas {teethWithGingiva, tooth, bracket}, 各有pointValues和cellValues两个typedArray
     */
    function handleTeethActorDatas(teethType, actorDatas) {
        const { teethWithGingiva, tooth, bracket } = actorDatas;
        // gingiva
        var { actor, mapper } = generateActorByData(teethWithGingiva);
        actor.setPickable(false)
        actor.getProperty().setColor(actorColorConfig.teeth);
        allActorList[teethType].teethWithGingiva = {
            actor,
            mapper,
        };
        // originGingiva
        var { actor, mapper } = generateActorByData(teethWithGingiva);
        actor.setPickable(false)
        actor.getProperty().setColor(actorColorConfig.teeth);
        allActorList[teethType].originGingiva = {
            actor,
            mapper,
        };
        // tooth
        Object.keys(tooth).forEach((name) => {
            const { actor, mapper, polyData } = generateActorByData(
                tooth[name]
            );
            actor.setPickable(false)
            toothPolyDatas[name] = polyData;
            actor.getProperty().setColor(actorColorConfig.teeth);
            allActorList[teethType].tooth.push({ name, actor, mapper });
        });
        // originTooth
        Object.keys(tooth).forEach((name) => {
            const { actor, mapper, polyData } = generateActorByData(
                tooth[name]
            );
            actor.setPickable(false)
            actor.getProperty().setColor(actorColorConfig.teeth);
            allActorList[teethType].originTooth.push({ name, actor, mapper });
        });
        // bracket
        Object.keys(bracket).forEach((name) => {
            const { widget, polyData } = generateBracketWidgetByData(
                bracket[name],
                name,
            );

            bracketPolyDatas[name] = polyData;
            // actor.getProperty().setColor(actorColorConfig.bracket.default);
            // 初始为normal模式,设置为[mat1,mat3], mat3是单位矩阵, 因此就是mat1
            // actor.setUserMatrix(userMatrixList.mat1[name]);
            allActorList[teethType].bracket.push({ 
                name, 
                widget, 
                color: actorColorConfig.bracket.default,
                userMatrix: userMatrixList.mat1[name],
            });
        });
        // originBracket
        Object.keys(bracket).forEach((name) => {
            const { actor, mapper, polyData } = generateActorByData(
                bracket[name]
            );

            actor.getProperty().setColor(actorColorConfig.bracket.default);
            // 初始为normal模式,设置为[mat1,mat3], mat3是单位矩阵, 因此就是mat1
            actor.setUserMatrix(userMatrixList.mat1[name]);
            allActorList[teethType].originBracket.push({ name, actor, mapper });
        });

        // // toothBox
        // Object.keys(tooth).forEach((name) => {
        //     toothBoxPoints[name] = {
        //         Point0: [0, 0, 0],
        //         Point1: [0, 0, 0],
        //         Point2: [0, 0, 0],
        //         Point3: [0, 0, 0],
        //         Point4: [0, 0, 0],
        //         Point5: [0, 0, 0],
        //         Point6: [0, 0, 0],
        //         Point7: [0, 0, 0]
        //     };
        // })
    }
    function generateActorByData({ pointValues, cellValues }) {
        const polyData = vtkPolyData.newInstance();
        polyData.getPoints().setData(pointValues);
        polyData.getPolys().setData(cellValues);

        const mapper = vtkMapper.newInstance();
        mapper.setInputData(polyData);
        const actor = vtkActor.newInstance();
        actor.setMapper(mapper);
        return { actor, mapper, polyData };
    }
    function generateBracketWidgetByData({ pointValues, cellValues }, name) {
        const polyData = vtkPolyData.newInstance();
        polyData.getPoints().setData(pointValues);
        polyData.getPolys().setData(cellValues);
        const widget = vtkBracketWidget.newInstance({
            pointValues,
            cellValues,
            pointType: 'Float32Array',
            generate3DTextureCoordinates: false,
            generateFaces: true,
            generateLines: false,
            activeColor: [25, 204, 25],
            activeScaleFactor: 1,
            behaviorParams: {
                store,
                name,
            }
        });
        return { widget, polyData };
    }

    /**
     * @description 根据给出数据构造坐标轴和距离线
     * @param teethType upper | lower
     * @param actorDatas 坐标轴和距离线的pointValues和cellValues
     */
    function handleAxisActorDatas(teethType, actorDatas) {
        const { axis, line } = actorDatas;

        // axis
        for (let name in axis) {
            const actors = [];
            axis[name].forEach((item) => {
                const { pointValues, lineValues, color, isLongAxis } = item;
                const polyData = vtkPolyData.newInstance();
                polyData.getPoints().setData(pointValues);
                polyData.getLines().setData(lineValues);
                const mapper = vtkMapper.newInstance();
                mapper.setInputData(polyData);
                const actor = vtkActor.newInstance();
                actor.setMapper(mapper);
                actor
                    .getProperty()
                    .setRepresentation(vtkProperty.Representation.WIREFRAME); // 设置面片显示为网线框架结构
                actor.getProperty().setLighting(false);
                actor.getProperty().setColor(color);
                actors.push(actor);
                if (isLongAxis) {
                    const offsets = [
                        [1e-4, 0, 0],
                        [-1e-4, 0, 0],
                        [0, 1e-4, 0],
                        [0, -1e-4, 0],
                        [0, 0, 1e-4],
                        [0, 0, -1e-4],

                        [0, 1e-4, 1e-4],
                        [0, 1e-4, -1e-4],
                        [0, -1e-4, 1e-4],
                        [0, -1e-4, -1e-4],
                        [1e-4, 0, 1e-4],
                        [1e-4, 0, -1e-4],
                        [-1e-4, 0, 1e-4],
                        [-1e-4, 0, -1e-4],
                        [1e-4, 1e-4, 0],
                        [1e-4, -1e-4, 0],
                        [-1e-4, 1e-4, 0],
                        [-1e-4, -1e-4, 0],

                        [1e-4, 1e-4, 1e-4],
                        [1e-4, 1e-4, -1e-4],
                        [1e-4, -1e-4, 1e-4],
                        [-1e-4, 1e-4, 1e-4],
                        [1e-4, -1e-4, -1e-4],
                        [-1e-4, 1e-4, -1e-4],
                        [-1e-4, -1e-4, 1e-4],
                        [-1e-4, -1e-4, -1e-4],
                    ];
                    // 加粗的土方法：在附近加线
                    offsets.forEach((offset) => {
                        const cutActor = vtkActor.newInstance();
                        cutActor.setMapper(mapper);
                        cutActor
                            .getProperty()
                            .setRepresentation(
                                vtkProperty.Representation.WIREFRAME
                            );
                        cutActor.setScale(
                            1 + 2 * offset[0],
                            1 + 2 * offset[1],
                            1 + 2 * offset[2]
                        );
                        cutActor.getProperty().setColor(1, 0, 0);
                        actors.push(cutActor);
                    });
                }
            });
            allActorList[teethType].toothAxis.push({ name, actors });
        }
        // line
        for (let name in line) {
            const { pointValues, cellValues, distance } = line[name];
            const {
                position: { center, zNormal },
            } = bracketData[teethType].filter((item) => item.name === name)[0];
            const { startPoint, endPoint } = longAxisData[name];
            const lineActorItem = initDistanceLineWithData(
                center,
                startPoint,
                endPoint,
                zNormal,
                1.5,
                vtkTextContainer.value,
                pointValues,
                cellValues,
                distance
            );

            // 制造牙尖牙底点
            // 根据需要, 后续需要设置renderer和renderWindow
            const dependingPoints = new Float32Array(
                toothPolyDatas[name].getPoints().getData()
            );
            // 20240617更新：widgetManager管理小球
            const startPointWidget = vtkSphereWidget.newInstance({
                activeColor: [204, 64, 64],
                activeScaleFactor: 1,
                behaviorParams: {
                    dependingPoints,
                    updatePosFunc: (updatedPoint, renderer, renderWindow) =>
                    updateLongAxisPoint(
                        teethType,
                        name,
                        "start",
                        updatedPoint,
                        renderer,
                        renderWindow
                    ),
                    renderer: null,
                    renderWindow: null,
                    inverseMatrix: null,
                    center: startPoint,
                },
            });
            const endPointWidget = vtkSphereWidget.newInstance({
                activeColor: [204, 64, 64],
                activeScaleFactor: 1,
                behaviorParams: {
                    dependingPoints,
                    updatePosFunc: (updatedPoint, renderer, renderWindow) =>
                    updateLongAxisPoint(
                        teethType,
                        name,
                        "end",
                        updatedPoint,
                        renderer,
                        renderWindow
                    ),
                    renderer: null,
                    renderWindow: null,
                    inverseMatrix: null,
                    center: endPoint,
                },
            });
            allActorList[teethType].distanceLine.push({
                name,
                lineActorItem,
                // 20240617更新：由于版本变动，小球widget全部重写
                startPoint,
                startPointWidget,
                endPoint,
                endPointWidget,
            });
            // 写入距离列表
            distanceMessageList.forEach((itemList) => {
                itemList.forEach((item) => {
                    if (item.name === name) {
                        item.distance = lineActorItem.distance;
                    }
                });
            });
        }
    }

    let hasRotateFlag = false; //用来表明有无转矩信息，只有特定托槽有转矩信息
    /**
     * @description 创建2个worker子线程并开始进行数据下载和解析
     */
    function startWorker(handleTeethType) {
        // let remainTooth = ['UL6', 'UL7', 'UR1', 'UR6', 'UR7']

        for (let teethType of handleTeethType) {
            // for (let teethType of ['upper', 'lower']) {
            // 创建子线程
            const worker = new DataLoadAndParseWorker();
            // 建立接收数据的方法
            worker.onmessage = function(event) {
                const { step } = event.data;
                switch (step) {
                    case 2: {
                        // queryModelPath
                        for (let stateKey in progressConfig[teethType]["2"]
                            .state) {
                            // message, type, progress
                            progressConfig[teethType]["2"].state[stateKey] =
                                event.data[stateKey];
                        }
                        const { toNext } = event.data;
                        if (toNext) {
                            currentStep[teethType]++;
                            worker.postMessage({ step: 3 });
                        }
                        break;
                    }
                    case 3: {
                        // downloadModel
                        for (let stateKey in progressConfig[teethType]["3"]
                            .state) {
                            // message, type, progress
                            progressConfig[teethType]["3"].state[stateKey] =
                                event.data[stateKey];
                        }
                        const { toNext } = event.data;
                        if (toNext) {
                            currentStep[teethType]++;
                            worker.postMessage({ step: 4 });
                        }
                        break;
                    }
                    case 4: {
                        // handleModel
                        for (let stateKey in progressConfig[teethType]["4"]
                            .state) {
                            // message, type, progress
                            progressConfig[teethType]["4"].state[stateKey] =
                                event.data[stateKey];
                        }
                        const { toNext } = event.data;
                        if (toNext) {
                            currentStep[teethType]++;
                            worker.postMessage({ step: 5 });
                        }
                        break;
                    }
                    case 5: {
                        // parseCADO
                        for (let stateKey in progressConfig[teethType]["5"]
                            .state) {
                            // message, type, progress
                            progressConfig[teethType]["5"].state[stateKey] =
                                event.data[stateKey];
                        }
                        const { toNext, targetBracketUID } = event.data;
                        if (toNext) {
                            stlObj.teeth[teethType] = event.data.stlObj;
                            xmlObj[teethType] = event.data.xmlObj;

                            const {
                                arrangeMatrix,
                                dentalArchSettings,
                                teethStandardAxis,
                                teethAxisFinetuneRecord,
                                dentalArchAdjustRecord,
                                // toothBoxPoints,
                            } = event.data.arrangeData;
                            if (teethStandardAxis) {
                                // 保存
                                store.dispatch(
                                    "actorHandleState/updateTeethStandardAxis",
                                    { [teethType]: teethStandardAxis }
                                );
                            }
                            if (teethAxisFinetuneRecord) {
                                // 保存
                                store.dispatch(
                                    "actorHandleState/updateTeethAxisFinetuneRecord",
                                    { [teethType]: teethAxisFinetuneRecord }
                                );
                            } else {
                                // 用标准坐标系数据
                                store.dispatch(
                                    "actorHandleState/updateTeethAxisFinetuneRecord",
                                    { [teethType]: teethStandardAxis }
                                );
                            }
                            if (dentalArchSettings) {
                                // 保存
                                store.dispatch(
                                    "actorHandleState/updateDentalArchSettings",
                                    { [teethType]: dentalArchSettings }
                                );
                            }
                            if (arrangeMatrix) {
                                // 更新转换矩阵(托槽牙齿位置->牙弓线位置)
                                store.dispatch(
                                    "actorHandleState/updateArrangeMatrix",
                                    arrangeMatrix
                                );
                            }
                            if (dentalArchAdjustRecord) {
                                // 更新牙弓线调整小球记录
                                store.dispatch(
                                    "actorHandleState/saveAdjustWidgetCenters",
                                    {
                                        [teethType]: dentalArchAdjustRecord,
                                    }
                                );
                            }
                            if (xmlObj[teethType]) {
                                for (let i = 0; i < xmlObj[teethType].teethBoxPoints.length; i++) {
                                    const toothName = xmlObj[teethType].teethBoxPoints[i].toothName[0];
                                    const stringArray0 = xmlObj[teethType].teethBoxPoints[i].Point0[0].split(",");
                                    const coordinateArray0 = stringArray0.map(Number);
                                    const stringArray1 = xmlObj[teethType].teethBoxPoints[i].Point1[0].split(",");
                                    const coordinateArray1 = stringArray1.map(Number);
                                    const stringArray2 = xmlObj[teethType].teethBoxPoints[i].Point2[0].split(",");
                                    const coordinateArray2 = stringArray2.map(Number);
                                    const stringArray3 = xmlObj[teethType].teethBoxPoints[i].Point3[0].split(",");
                                    const coordinateArray3 = stringArray3.map(Number);
                                    const stringArray4 = xmlObj[teethType].teethBoxPoints[i].Point4[0].split(",");
                                    const coordinateArray4 = stringArray4.map(Number);
                                    const stringArray5 = xmlObj[teethType].teethBoxPoints[i].Point5[0].split(",");
                                    const coordinateArray5 = stringArray5.map(Number);
                                    const stringArray6 = xmlObj[teethType].teethBoxPoints[i].Point6[0].split(",");
                                    const coordinateArray6 = stringArray6.map(Number);
                                    const stringArray7 = xmlObj[teethType].teethBoxPoints[i].Point7[0].split(",");
                                    const coordinateArray7 = stringArray7.map(Number);
                                    toothBoxPoints[toothName] = {
                                        Point0: coordinateArray0,
                                        Point1: coordinateArray1,
                                        Point2: coordinateArray2,
                                        Point3: coordinateArray3,
                                        Point4: coordinateArray4,
                                        Point5: coordinateArray5,
                                        Point6: coordinateArray6,
                                        Point7: coordinateArray7,
                                    }
                                }
                                store.dispatch(
                                    "actorHandleState/updateToothBoxPoints",
                                    toothBoxPoints
                                )
                            }
                            currentStep[teethType]++;
                            worker.postMessage({
                                step: 6,
                                browser: browserType(),
                            });
                        }
                        // 从static_config.js中读取转矩配置信息
                        hasRotateFlag = rotateConfigList[0].bracketType==targetBracketUID;
                        rotateConfigList.forEach((configList)=>{
                            if(hasRotateFlag){
                                configList[teethType].forEach((tooth)=>{
                                    rotateMessageList[tooth.name[2]-1].forEach((targetTooth)=>{
                                        if(tooth.name==targetTooth.name){
                                            targetTooth.rotate = tooth.rotate
                                        }
                                    })
                                })
                            }
                        })
                        // 从xml中读取转矩调整信息
                        if(xmlObj[teethType]){
                            const positionInfo = xmlObj[teethType].PositionResult[0].Position
                            positionInfo.forEach((posInfo)=>{
                                rotateMessageList[posInfo.$.name[2]-1].forEach((targetTooth)=>{
                                    if(posInfo.$.name==targetTooth.name){
                                        if(posInfo.RotatePlus){
                                            targetTooth.plus = Number(posInfo.RotatePlus);
                                        }
                                    }
                                })
                            })
                        }
                        break;
                    }
                    case 6: {
                        // downloadBracketData
                        for (let stateKey in progressConfig[teethType]["6"]
                            .state) {
                            // message, type, progress
                            progressConfig[teethType]["6"].state[stateKey] =
                                event.data[stateKey];
                        }
                        const { toNext } = event.data;
                        if (toNext) {
                            currentStep[teethType]++;
                            worker.postMessage({ step: 7 });
                        }
                        break;
                    }
                    case 7: {
                        // parseBracketData
                        for (let stateKey in progressConfig[teethType]["7"]
                            .state) {
                            // message, type, progress
                            progressConfig[teethType]["7"].state[stateKey] =
                                event.data[stateKey];
                        }
                        const { toNext } = event.data;
                        if (toNext) {
                            currentStep[teethType]++;
                            worker.postMessage({ step: 8 });
                        }
                        break;
                    }
                    case 8: {
                        // generateTeethActor
                        for (let stateKey in progressConfig[teethType]["8"]
                            .state) {
                            // message, type, progress
                            progressConfig[teethType]["8"].state[stateKey] =
                                event.data[stateKey];
                        }
                        const { toNext } = event.data;
                        if (toNext) {
                            mainCameraConfigs[teethType] =
                                event.data.mainCameraConfigs;

                            // //------------------------------------------------
                            // // 调试用
                            // for (let toothName of Object.keys(event.data.bracketData)) {
                            //     if(toothName[0]===remainTooth[0][0] && !remainTooth.includes(toothName)) {
                            //         delete event.data.bracketData[toothName]
                            //     }
                            // }
                            // for (let toothName of Object.keys(event.data.allActorList.tooth)) {
                            //     if(toothName[0]===remainTooth[0][0] && !remainTooth.includes(toothName)) {
                            //         delete event.data.allActorList.tooth[toothName]
                            //         delete event.data.allActorList.bracket[toothName]
                            //     }
                            // }
                            // //------------------------------------------------

                            for (let name in event.data.bracketData) {
                                let {
                                    direction,
                                    position,
                                    fineTuneRecord,
                                    fineTuneRecordRotate,
                                    initTransMatrix,
                                    initTransMatrixRotate,
                                    bottomFaceIndexList,
                                    bracketBottomPointValues,
                                } = event.data.bracketData[name];
                                userMatrixList.mat1[name] = initTransMatrix; // 托槽初始变换矩阵即为mat1, 保存
                                // 只有带有转矩信息才需要传入mat6
                                if(hasRotateFlag){
                                    userMatrixList.mat6[name] = initTransMatrixRotate; // 托槽初始变换矩阵即为mat1, 保存
                                    userMatrixList.invMat6[name] = invertMatrix4x4(initTransMatrixRotate); // 托槽初始变换矩阵即为mat1, 保存    
                                }
                                if(!hasRotateFlag){
                                    fineTuneRecordRotate = fineTuneRecord
                                }
                                bracketData[teethType].push({
                                    name,
                                    direction,
                                    position,
                                    fineTuneRecord,
                                    fineTuneRecordRotate,
                                    bottomFaceIndexList,
                                    bracketBottomPointValues,
                                });
                            }

                            handleTeethActorDatas(
                                teethType,
                                event.data.allActorList
                            );
                            currentStep[teethType]++;
                            worker.postMessage({
                                step: 9,
                            });
                        }
                        break;
                    }
                    case 9: {
                        // generateTeethAxisActor
                        for (let stateKey in progressConfig[teethType]["9"]
                            .state) {
                            // message, type, progress
                            progressConfig[teethType]["9"].state[stateKey] =
                                event.data[stateKey];
                        }
                        const { toNext } = event.data;
                        if (toNext) {
                            for (let name in event.data.longAxisData) {
                                longAxisData[name] =
                                    event.data.longAxisData[name];
                            }

                            // //------------------------------------------------
                            // // 调试用
                            // for (let toothName of Object.keys(event.data.allActorList.axis)) {
                            //     if(toothName[0]===remainTooth[0][0] && !remainTooth.includes(toothName)) {
                            //         delete event.data.allActorList.axis[toothName]
                            //         delete event.data.allActorList.line[toothName]
                            //     }
                            // }
                            // //------------------------------------------------
                            handleAxisActorDatas(
                                teethType,
                                event.data.allActorList
                            );
                            // worker.terminate();
                            currentStep[teethType]++;
                            
                            worker.postMessage({
                                step: 10,
                            });
                        }
                        break;
                    }
                    case 10: {
                        // generateTeethAxisActor
                        for (let stateKey in progressConfig[teethType]["10"]
                            .state) {
                            // message, type, progress
                            progressConfig[teethType]["10"].state[stateKey] =
                                event.data[stateKey];
                        }
                        const { toNext } = event.data;
                        if (toNext) {
                            console.log(teethType)
                            const { root, rootGenerate, originRoot } = event.data.allActorList
                            root.forEach(({toothName, bottomSphereCenter, topSphereCenter, radiusSphereCenter})=>{
                                //制造牙根底部、牙根顶部、牙根半径三个小球
                                const rootWidget = vtkRootWidget.newInstance({
                                    activeColor: [204, 64, 64],
                                    activeScaleFactor: 1,
                                    behaviorParams: {
                                    }
                                });
                                allActorList[teethType].root.push({
                                    toothName,
                                    rootWidget,
                                    bottomSphereCenter,
                                    topSphereCenter,
                                    radiusSphereCenter,
                                })
                            })
                            store.dispatch(
                                "actorHandleState/setInitRootParams",
                                {[teethType]: root,}
                            );
                            
                            if (rootGenerate.length>0){
                                const rootList = []
                                const originRootList = []
                                rootGenerate.forEach(({toothName, pointValues, cellValues})=>{
                                    const {actor, mapper} = generateActorByData({pointValues, cellValues})
                                    actor.getProperty().setColor([1, 0.73, 0.73]);
                                    rootList.push({ name: toothName, actor, mapper })
                                })
                                originRoot.forEach(({toothName, pointValues, cellValues})=>{
                                    const {actor, mapper} = generateActorByData({pointValues, cellValues})
                                    actor.getProperty().setColor([1, 0.73, 0.73]);
                                    originRootList.push({ name: toothName, actor, mapper })
                                })
                                allActorList[teethType].rootGenerate = rootList;
					            allActorList[teethType].originRoot = originRootList;
                            }

                            worker.terminate();
                            currentStep[teethType]++;
                        }
                        break;
                    }
                }
            };
            // 发送首次通信
            const modelType =
                teethType === "upper" ? "UpperConfig" : "LowerConfig";
            worker.postMessage({
                step: 2,
                configApi: window.linkConfig.modelDownloadLinkQueryFullApi
                    .replace("#param_patientUID#", patientUID.value)
                    .replace("#param_modelType#", modelType),
                teethType,
                windowLinkConfig: window.linkConfig,
                authToken: authConfig.token,
                authId: authConfig.id,
            });
        }
    }
    return {
        allActorList,
        patientUID,
        progressConfig,
        currentStep,
        stlObj,
        xmlObj,
        toothPolyDatas,
        bracketPolyDatas,
        mainCameraConfigs,
        bracketData,
        updateDistanceLineActor,
        distanceMessageList,
        rotateMessageList,
        longAxisData,
        toothBoxPoints,
    };
}
