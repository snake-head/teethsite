import { invertMatrix } from "@kitware/vtk.js/Common/Core/Math";
import vtkPoints from "@kitware/vtk.js/Common/Core/Points";
import vtkLandmarkTransform from "@kitware/vtk.js/Common/Transform/LandmarkTransform";
import { bracketNameList } from "../static_config";
import { calculateRigidBodyTransMatrix } from "../utils/bracketFineTuneByTypedArray";

// 本文件专门用于各种userMatrix变换

/**
 * @description 根据center, xNormal, yNormal, zNormal计算刚体配准变换矩阵
 * @param originalData 原始坐标系{center, xNormal, yNormal, zNormal}
 * @param targetData 目标坐标系{center, xNormal, yNormal, zNormal}
 */
function calculateTransMatrix(originalData, targetData) {
    const {
        center: centerO,
        xNormal: xNormalO,
        yNormal: yNormalO,
        zNormal: zNormalO,
    } = originalData;
    const {
        center: centerT,
        xNormal: xNormalT,
        yNormal: yNormalT,
        zNormal: zNormalT,
    } = targetData;
    let originPoints = vtkPoints.newInstance(); // 原始点集
    originPoints.setData([
        centerO[0] + xNormalO[0],
        centerO[1] + xNormalO[1],
        centerO[2] + xNormalO[2],
        centerO[0] + yNormalO[0],
        centerO[1] + yNormalO[1],
        centerO[2] + yNormalO[2],
        centerO[0] + zNormalO[0],
        centerO[1] + zNormalO[1],
        centerO[2] + zNormalO[2],
    ]);
    let targetPoints = vtkPoints.newInstance(); // 目标点集
    targetPoints.setData([
        centerT[0] + xNormalT[0],
        centerT[1] + xNormalT[1],
        centerT[2] + xNormalT[2],
        centerT[0] + yNormalT[0],
        centerT[1] + yNormalT[1],
        centerT[2] + yNormalT[2],
        centerT[0] + zNormalT[0],
        centerT[1] + zNormalT[1],
        centerT[2] + zNormalT[2],
    ]);
    // 根据点集计算转换矩阵
    const transform = vtkLandmarkTransform.newInstance();

    transform.setMode(0); // 刚体配准(只允许平移+旋转)
    transform.setSourceLandmark(originPoints); // vtkPoints:3D源点集列表
    transform.setTargetLandmark(targetPoints); // vtkPoints:3D目标点集列表
    transform.update(); // 根据目标点集和源点集启动矩阵计算

    return transform.getMatrix(); // mat4矩阵,转换结果(4*4)(平移加旋转)
}

function multiplyMatrix4x4(mat1, mat2) {
    const out = new Float64Array(16);
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            out[4 * i + j] = 0; // out[i][j]
            for (let k = 0; k < 4; k++) {
                out[4 * i + j] += mat1[4 * i + k] * mat2[4 * k + j]; // out[i][j]+=mat1[i][k] * mat2[k][j]
            }
        }
    }
    return out;
}

/**
 * 
 * @param matList [0,0,1,...], [0,1,0,...], [1,1,1,...]
 * 或者 [[0,0,1,...], [0,1,0,...], [1,1,1,...]]
 */
function multiplyMatrixList4x4(...matList) {
   if (matList.length === 1) {
        return matList[0].reduce(
            (pre, cur) => {
                return multiplyMatrix4x4(pre, cur);
            },
            [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
        );
   }
    return matList.reduce(
        (pre, cur) => {
            return multiplyMatrix4x4(pre, cur);
        },
        [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    );
}

function invertMatrix4x4(mat) {
    // 在旧版本中，invertMatrix是对二维数组进行计算；新版本中是对一维数组进行计算，所以不需要处理
    const mat4x4 = [
        ...mat
    ];
    invertMatrix(mat4x4, mat4x4, 4);
    return mat4x4;
}

export { multiplyMatrix4x4, multiplyMatrixList4x4, invertMatrix4x4, calculateTransMatrix };

export default function() {
    let userMatrixList = {
        identity: {}, //单位矩阵(初始化后不再变更)
        mat1: {}, // 原点->preFineTuneRecord的牙齿位置(托槽加载完时将存入最新数据)
        mat2: {}, // preFineTuneRecord的牙齿位置->牙弓线位置
        invMat2: {}, // 用于文字的位置变换
        mat3: {}, // 在原始牙齿上 托槽旧位置->新位置
        invMat3: {}, // 在原始牙齿上 托槽新位置->旧位置
        mat4: {}, // 排牙后的颌牙 旧位置->新位置
        invMat4: {}, // 排牙后的颌牙 新位置->旧位置
        mat5: {}, // 原始坐标系->标准坐标系, 仅用于牙齿坐标系Actor
        mat6: {}, // 牙齿和托槽 转矩变换前位置->转矩变换后位置
        invMat6: {}, // 牙齿和托槽 转矩变换后位置->转矩变换前位置
    }; // 转换矩阵列表, 用于映射[模拟排牙]前后的actor相对位置
    let applyCalMatrix = {
        // 托槽
        bracket: {},
        // 牙齿/坐标轴/距离线/距离文字
        tad: {},
        // 轴点反映射(现牙齿->原牙齿)
        sphereReversrProj: {},
        // 轴点依赖点集转换
        dependingTrans: {},
        // 牙弓线
        arch: { upper: [], lower: [] },
        // 牙齿坐标系actor
        teethAxisSphere: {},
    }; // 每个actor应该应用的最终矩阵(相对独立, 但其中的tad关联新坐标轴的设置)
    let teethAxisFinetuneRecord = {
        upper: {},
        lower: {},
    }; // 用于记录颌牙位置调整的记录, 该记录center, xNormal,yNormal,zNormal在排牙时获得初始化值, 注意坐标系的生成不会随任何矩阵的改变而改变
    // 即颌牙位置调整不用随排牙或微调而改变, 初始值(重置值)记录于teethStandardAxis中, 重置时调用, 首次调整位置时调用以初始化
    // 二者共同算出mat4和invMat4

    /**
     * @description 初始化userMatrix全部为全单位矩阵
     */
    function initUserMatrixList() {
        for (let name of bracketNameList) {
            if (!userMatrixList.identity[name]) {
                // 如果已经有值(如托槽加载完毕时会更新mat1)则不覆盖
                userMatrixList.identity[name] = [
                    1,
                    0,
                    0,
                    0,
                    0,
                    1,
                    0,
                    0,
                    0,
                    0,
                    1,
                    0,
                    0,
                    0,
                    0,
                    1,
                ]; // 单位矩阵
            }
        }
        for (let teethType of ["upper", "lower"]) {
            userMatrixList.identity[teethType] = [
                1,
                0,
                0,
                0,
                0,
                1,
                0,
                0,
                0,
                0,
                1,
                0,
                0,
                0,
                0,
                1,
            ]; // 单位矩阵
        }
        Object.keys(userMatrixList).forEach((matType) => {
            // [identity,mat1,mat2,invMat2,mat3,invMat3,mat4,invMat4,mat5]
            if (
                ["mat1", "mat2", "invMat2", "mat3", "invMat3", "mat6", "invMat6"].includes(matType)
            ) {
                for (let name of bracketNameList) {
                    if (!userMatrixList[matType][name]) {
                        // 如果已经有值(如托槽加载完毕时会更新mat1)则不覆盖
                        userMatrixList[matType][name] =
                            userMatrixList.identity[name]; // 单位矩阵
                    }
                }
            }
            if (["mat4", "invMat4", "mat5"].includes(matType)) {
                // mat4, invmat4, mat5
                for (let teethType of ["upper", "lower"]) {
                    userMatrixList[matType][teethType] =
                        userMatrixList.identity[teethType]; // 单位矩阵
                }
            }
        });
    }
    function initApplyCalMatrix() {
        Object.keys(applyCalMatrix).forEach((typeKey) => {
            // bracket,tad,sphereReversrProj,dependingTrans,arch,teethAxisSphere
            if (["arch", "teethAxisSphere"].includes(typeKey)) {
                // 一个上颌牙/下颌牙只生成一个牙弓线/坐标系
                for (let teethType of ["upper", "lower"]) {
                    if (!applyCalMatrix.arch[teethType]) {
                        applyCalMatrix.arch[teethType] = [
                            1,
                            0,
                            0,
                            0,
                            0,
                            1,
                            0,
                            0,
                            0,
                            0,
                            1,
                            0,
                            0,
                            0,
                            0,
                            1,
                        ]; // 单位矩阵
                    }
                }
            } else {
                for (let name of bracketNameList) {
                    if (!applyCalMatrix[typeKey][name]) {
                        // 如果已经有值(如托槽加载完毕时会更新mat1)则不覆盖
                        applyCalMatrix[typeKey][name] = [
                            1,
                            0,
                            0,
                            0,
                            0,
                            1,
                            0,
                            0,
                            0,
                            0,
                            1,
                            0,
                            0,
                            0,
                            0,
                            1,
                        ]; // 单位矩阵
                    }
                }
            }
        });
    }

    /**
     * @description 在[通常模式]/[模拟排牙-托槽固定]/[模拟排牙-牙齿固定]中切换
     * 对 托槽,牙齿,坐标轴,距离线,距离文字,轴点反映射,牙弓线 setUserMatrix
     * 对轴点依赖点集进行转换
     * 点集转换依据下表进行:
     *        --------------------------------------------------
     *       |                  [normal]                       |
     *      |                     |  下颌牙    |   上颌牙       |
     *     |                 托槽 | mat1,mat3 | mat1,mat3     |
     *    |牙齿/坐标轴/距离/距离文字 | identity  | identity      |
     *   |             轴点反映射 | identity  | identity      |
     *  |               依赖点集 | identity  | identity      |
     * |                 牙弓线 | identity  | identity      |
     * ------------------------------------------------------------------
     *       |                  [toothFix]                                    |
     *      |                     |       下颌牙         |    上颌牙            |
     *     |                 托槽 | mat1,mat3,mat6,mat2,mat4 | mat1,mat3,mat6,mat2,mat4 |
     *    |牙齿/坐标轴/距离/距离文字 | mat2,mat6,mat4           | mat2,mat6,mat4           |
     *   |             轴点反映射 | invMat4,invMat6,invMat2     | invMat4,invMat6,invMat2     |
     *  |               依赖点集 | mat2,mat4,mat6           | mat2,mat4,mat6          |
     * |                 牙弓线 | mat4                | mat4                |
     * ------------------------------------------------------------------
     *        |                  [bracketFix]                                   |
     *      |                     | 下颌牙                | 上颌牙                |
     *     |                 托槽 | mat1,mat6,mat2,mat4       | mat1,mat6,mat2,mat4       |
     *    |牙齿/坐标轴/距离/距离文字 | invMat3,mat6,mat2,mat4    | invMat3,mat6,mat2,mat4    |
     *   |             轴点反映射 | invMat4,invMat2,invMat6,mat3 | invMat4,invMat2,invMat6,mat3 |
     *  |               依赖点集 | invMat3,mat6,mat2,mat4    | invMat3,mat6,mat2,mat4    |
     * |                 牙弓线 | mat4                 | mat4                 |
     * --------------------------------------------------------------
     * 各mat(matrix)变换矩阵能够执行的变换含义:
     * identity: 单位矩阵, 不作变换
     * mat1: 初始化为托槽由读入位置(0,0,0)到牙齿上初始位置的变换(加载时进行)
     * mat1更新时机: 排牙函数调用, 更新为由读入位置(0,0,0)到托槽当前微调位置(用于拟合牙弓线的位置)的变换
     * mat2: 初始化和更新由排牙函数计算, 由托槽当前微调位置(用于拟合牙弓线的位置)到排牙牙弓线上位置的变换
     * mat2更新时机: 排牙函数调用
     * mat3: 初始化和每次排牙初始化为identity
     * mat3更新时机: 托槽微调或重置时, 由托槽上次调用排牙函数时读取的微调位置(用于拟合牙弓线的位置)到新微调位置的变换
     * mat4: （咬合）整个上颌/下颌共享矩阵, 初始化为identity, 由颌牙当前位置到调整后位置, 应该mat123之后进行
     * mat4更新时机: 排牙状态下调整托槽位置, 在normal状态下不起作用, 排牙状态下共同作用
     * @param fromMode normal | simBracketFix | simToothFix
     * @param toMode normal | simBracketFix | simToothFix
     * @param bracketNames 允许排牙颌牙所包含牙齿名称列表
     */
    function updateApplyUserMatrixWhenSwitchMode(
        fromMode,
        toMode,
        bracketNames
    ) {
        // 根据简介表格可以生成各种转换, 注意依赖点集的转换可能需要先从一个状态逆变换最初的无变换状态(identity,即初始读入点)再转入另一个状态
        let applyMatrixType = { upper: {}, lower: {} };
        switch (toMode) {
            case "normal": {
                // 一般模式
                for (let teethType of ["upper", "lower"]) {
                    // 托槽
                    applyMatrixType[teethType].bracket = ["mat1", "mat3"];
                    // 牙齿/坐标轴/距离线/距离文字
                    applyMatrixType[teethType].tad = ["identity"];
                    // 轴点小球反映射(现牙齿->原牙齿) normal状态下就是现牙齿点集[identity], 是tad的逆矩阵
                    applyMatrixType[teethType].sphereReversrProj = ["identity"];
                    // 轴点依赖点集转换
                    applyMatrixType[teethType].dependingTrans =
                        fromMode === "simBracketFix"
                            ? // simBracketFix->normal
                              // [invMat3,mat2,mat4]->[identity]
                              // 解析: 逆变换[invMat4, invMat2, mat3]
                              ["invMat4", "invMat2", "mat3"]
                            : // simToothFix->normal
                              // [mat2,mat4]->[identity]
                              // 解析: 逆变换[invMat4, invMat2]
                              ["invMat4", "invMat2"];
                    // 牙弓线
                    applyMatrixType[teethType].arch = ["identity"];
                }
                break;
            }
            case "simToothFix": {
                // 模拟排牙-牙齿固定
                for (let teethType of ["upper", "lower"]) {
                    // 托槽
                    applyMatrixType[teethType].bracket = [
                        "mat1",
                        "mat3",
                        "mat6",
                        "mat2",
                        "mat4",
                    ];
                    // 牙齿/坐标轴/距离线/距离文字
                    applyMatrixType[teethType].tad = ["mat6", "mat2", "mat4"];
                    // 轴点反映射(现牙齿->原牙齿)
                    // 从当前变换后牙齿点集[mat2, mat4]反映射回normal状态下未经变换的牙齿点集[identity]
                    // 解析: 逆变换[invMat4, invMat2], 是tad的逆矩阵
                    applyMatrixType[teethType].sphereReversrProj = ["invMat4", "invMat2", "invMat6"]
                    // 轴点依赖点集转换
                    applyMatrixType[teethType].dependingTrans =
                        fromMode === "normal"
                            ? // normal->simToothFix
                              // [identity]->[mat2,mat4]
                              // 解析: 变换[mat2, mat4]
                              ["mat6", "mat2", "mat4"]
                            : // simBracketFix->simToothFix
                              // [invMat3,mat2,mat4]->[mat2,mat4]
                              // 解析: 逆变换[invMat4, invMat2, mat3]->变换[mat2, mat4]
                              ["invMat4","invMat2", "invMat6", "mat3", "mat6","mat2", "mat4"];
                    // 牙弓线
                    applyMatrixType[teethType].arch = ["mat4"];
                }
                break;
            }
            case "simBracketFix": {
                // 模拟排牙-托槽固定
                for (let teethType of ["upper", "lower"]) {
                    // 托槽
                    applyMatrixType[teethType].bracket = [
                        "mat1",
                        "mat6",
                        "mat2",
                        "mat4",
                    ];
                    // 牙齿/坐标轴/距离线/距离文字
                    applyMatrixType[teethType].tad = [
                        "invMat3",
                        "mat6",
                        "mat2",
                        "mat4",
                    ];
                    // 轴点反映射(现牙齿->原牙齿), 是tad的逆矩阵
                    applyMatrixType[teethType].sphereReversrProj = [
                        "invMat4",
                        "invMat2",
                        "invMat6",
                        "mat3",
                    ];
                    // 轴点依赖点集转换
                    applyMatrixType[teethType].dependingTrans =
                        fromMode === "normal"
                            ? // normal->simBracketFix
                              // [identity]->[invMat3,mat2,mat4]
                              // 解析: 变换[invMat3, mat2, mat4]
                              ["invMat3","mat6", "mat2", "mat4"]
                            : // simToothFix->simBracketFix
                              // [mat2,mat4]->[invMat3,mat2,mat4]
                              // 解析: 逆变换[invMat4, invMat2]->变换[invMat3, mat2, mat4]
                              ["invMat4", "invMat2","invMat6", "invMat3","mat6", "mat2", "mat4"];
                    // 牙弓线
                    applyMatrixType[teethType].arch = ["mat4"];
                }
                break;
            }
        }

        // 根据上述各种matType计算矩阵
        for (let teethType of ["upper", "lower"]) {
            Object.keys(applyMatrixType[teethType]).forEach((typeKey) => {
                // bracket,tad,sphereReversrProj,dependingTrans,arch
                // 牙弓线以upper,lower为键, 其它的都以托槽颗数为键
                if (typeKey === "arch") {
                    const matList = [];
                    for (let matType of applyMatrixType[teethType][typeKey]) {
                        // matType: identity/mat4/invmat4
                        matList.push(userMatrixList[matType][teethType]);
                    }
                    applyCalMatrix[typeKey][teethType] = multiplyMatrixList4x4(
                        matList
                    );
                } else {
                    for (let name of bracketNames[teethType]) {
                        const matList = [];
                        for (let matType of applyMatrixType[teethType][
                            typeKey
                        ]) {
                            // mat4, invMat4共用一个矩阵
                            matList.push(
                                ["mat4", "invMat4", "mat5"].includes(matType)
                                    ? userMatrixList[matType][teethType]
                                    : userMatrixList[matType][name]
                            );
                        }
                        applyCalMatrix[typeKey][name] = multiplyMatrixList4x4(
                            matList
                        );
                    }
                }
            });
        }
    }

    /**
     * @description 每次模拟排牙完成时调用的函数, 用于更新mat1,mat2,mat3
     * 通过读取当前fineTuneRecord, 更新mat1(原点->托槽排牙前一刻位置)
     * 通过读取arrangeMatrixList, 更新mat2(托槽排牙前一刻位置->牙弓线旧位置)和invMat2(牙弓线旧位置->托槽排牙前一刻位置)
     * 有多少牙齿以bracketData中的键为依据, arrangeMatrixList没有对应时, 默认mat2为单位矩阵
     * 此外更新mat3和invMat3为identity
     * 更新mat1的主要作用是更新托槽重置点为当前微调位置, 在模拟排牙下进行微调时点击重置, 会重置到牙弓线拟合点上而不是什么读入数据点
     * arrangeTeethType
     * @param arrangeTeethType 允许排牙颌牙类型
     * @param bracketNames 允许排牙颌牙所包含牙齿名称列表
     * @param arrangeMatrixList 更新排牙后所返回的每颗牙齿托槽的转换矩阵
     * @param preFineTuneRecord 托槽旧微调位置
     */
    function updateMatrixAfterArrangeTeeth(
        arrangeTeethType,
        bracketNames,
        arrangeMatrixList,
        preFineTuneRecord
    ) {
        // 进入模拟排牙, 根据排牙生成的位置方向更新全matrix
        for (let teethType of arrangeTeethType) {
            for (let name of bracketNames[teethType]) {
                const preActorMatrix = preFineTuneRecord[teethType][name]; // 托槽旧位置
                const { center, xNormal, yNormal, zNormal } = preActorMatrix;
                const arrangeMatrix = arrangeMatrixList[name]; // 牙弓线位置
                // 更新mat1
                userMatrixList.mat1[name] = calculateRigidBodyTransMatrix(
                    center,
                    xNormal,
                    yNormal,
                    zNormal
                ); // 原点->托槽排牙前旧位置
                // 更新mat3和invMat3为identity
                userMatrixList.mat3[name] = userMatrixList.identity[name];
                userMatrixList.invMat3[name] = userMatrixList.identity[name];

                // 如果排过牙, 就调整mat2
                if (arrangeMatrix) {
                    userMatrixList.mat2[name] = calculateTransMatrix(
                        preActorMatrix,
                        arrangeMatrix
                    ); // 托槽排牙前旧位置->牙弓线旧位置
                    userMatrixList.invMat2[name] = calculateTransMatrix(
                        arrangeMatrix,
                        preActorMatrix
                    ); // 牙弓线旧位置->托槽排牙前旧位置
                }
            }
        }
    }

    /**
     * @description 在托槽微调/重置时调用的函数, 用于更新mat3+invMat3
     * 该函数不会切换状态, 根据applyUserMatrixWhenSwitchMode的表格
     * 只针对某颗牙齿相关的actor中和mat3+invMat3相关的矩阵
     * @param bracketName 操作中托槽名称
     * @param bracketTeethType 操作中托槽所属颌牙类型
     * @param preBracketPosition 操作中托槽读入位置 (*排牙时会更新该位置)
     * @param newFineTuneRecord 新的微调位置
     * @param currMode 当前模式
     */
    function updateSingleBracketUserMatrix(
        bracketName,
        bracketTeethType,
        preBracketPosition,
        newFineTuneRecord,
        currMode,
        isRotate=false,
    ) {
        // 旧位置(上次排牙前一刻位置/数据读入位置)->新位置
        const mat = calculateTransMatrix(
            preBracketPosition,
            newFineTuneRecord
        );
        // 新位置->旧位置(上次排牙前一刻位置/数据读入位置)
        const invMat = calculateTransMatrix(
            newFineTuneRecord,
            preBracketPosition
        );
        // 更新mat3和invMat3
        if(!isRotate){
            userMatrixList.mat3[bracketName] = mat;
            userMatrixList.invMat3[bracketName] = invMat;    
        }else{
            userMatrixList.mat6[bracketName] = mat;
            userMatrixList.invMat6[bracketName] = invMat;   
        }
        // ---更新数据(针对对应牙齿相关actor)---
        const needToUpdate = {};
        switch (currMode) {
            case "normal": {
                // 一般模式
                // 托槽
                needToUpdate.bracket = ["mat1", "mat3"];
                // 牙齿/坐标轴/距离线/距离文字
                needToUpdate.tad = false;
                // 轴点反映射(现牙齿->原牙齿)
                needToUpdate.sphereReversrProj = false;
                // 轴点依赖点集转换
                needToUpdate.dependingTrans = false;
                break;
            }
            case "simToothFix": {
                // 模拟排牙-牙齿固定
                // 托槽
                needToUpdate.bracket = ["mat1", "mat3","mat6", "mat2", "mat4"];
                // 牙齿/坐标轴/距离线/距离文字
                needToUpdate.tad = ["mat6", "mat2", "mat4"];
                // 轴点反映射(现牙齿->原牙齿)
                needToUpdate.sphereReversrProj = ["invMat4", "invMat2", "invMat6"];
                // 轴点依赖点集转换
                needToUpdate.dependingTrans = ["mat6", "mat2", "mat4"];     
                break;
            }
            case "simBracketFix": {
                // 模拟排牙-托槽固定
                // 托槽
                needToUpdate.bracket = ["mat1", "mat6", "mat2", "mat4"];
                // 牙齿/坐标轴/距离线/距离文字
                needToUpdate.tad = ["invMat3", "mat6", "mat2", "mat4"];
                // 轴点反映射(现牙齿->原牙齿)
                needToUpdate.sphereReversrProj = ["invMat4", "invMat2", "invMat6", "mat3"];
                // 轴点依赖点集转换
                needToUpdate.dependingTrans = ["invMat3", "mat6", "mat2", "mat4"];
                break;
            }
        }
        // 根据key计算矩阵
        Object.keys(needToUpdate).forEach((typeKey) => {
            // bracket,tad,sphereReversrProj,dependingTrans
            if (!applyCalMatrix[typeKey]) {
                applyCalMatrix[typeKey] = {};
            }
            if (needToUpdate[typeKey]) {
                const matList = [];
                for (let matType of needToUpdate[typeKey]) {
                    matList.push(
                        ["mat4", "invMat4", "mat5"].includes(matType)
                            ? userMatrixList[matType][bracketTeethType]
                            : userMatrixList[matType][bracketName]
                    );
                }
                applyCalMatrix[typeKey][bracketName] = multiplyMatrixList4x4(
                    matList
                );
            }
        });
        return Object.fromEntries(
            Object.entries(needToUpdate).map(([actorType, value]) => [
                actorType,
                value !== false ? true : false,
            ])
        );
    }

    /**
     * @description 在首次排牙牙齿坐标系actor生成后调用, 用于初始化mat5
     * 其中mat5仅在此次计算之后便维持不变, 因为牙齿标准坐标系根据牙齿读入数据生成, 不可能再变化
     * @param arrangeTeethType 允许排牙颌牙类型
     * @param teethStandardAxis 牙齿标准坐标系数据, 每个颌牙包括 {center, xNormal, yNormal, zNormal}
     */
    function initMatrixForTeethAxisSphere(arrangeTeethType, teethStandardAxis) {
        for (let teethType of arrangeTeethType) {
            // 读取排牙中计算的牙齿标准坐标系
            const { center, xNormal, yNormal, zNormal } = teethStandardAxis[
                teethType
            ];
            // 初始化teethAxisFinetuneRecord为标准坐标系
            if (!teethAxisFinetuneRecord[teethType].xNormal) {
                teethAxisFinetuneRecord[teethType] = {
                    ...teethAxisFinetuneRecord[teethType],
                    center: [...center],
                    xNormal: [...xNormal],
                    yNormal: [...yNormal],
                    zNormal: [...zNormal],
                };
            }
            userMatrixList.mat5[teethType] = calculateRigidBodyTransMatrix(
                center,
                xNormal,
                yNormal,
                teethType === "upper"
                    ? [-zNormal[0], -zNormal[1], -zNormal[2]]
                    : zNormal
            );
            applyCalMatrix.teethAxisSphere[teethType] = multiplyMatrix4x4(
                userMatrixList.mat5[teethType],
                userMatrixList.mat4[teethType]
            );
        }
    }

    /**
     * @description 双颌咬合关系调整时调用, 根据teethAxisFinetuneRecord的更新调整mat4相关矩阵变换
     * @param teethType 操作中颌牙类型
     * @param teethStandardAxis 操作中颌牙的标准坐标系
     * @param bracketNamesOfTargetTeethType 操作中颌牙所包含牙齿名称列表
     * @param fineTuneMode 当前微调模式
     */
    function updateMatrixWhenFineTuneTeethPosition(
        teethType,
        teethStandardAxis,
        bracketNamesOfTargetTeethType,
        fineTuneMode
    ) {
        // 计算新的变换矩阵mat4
        const newMat4 = calculateTransMatrix(
            teethStandardAxis[teethType],
            teethAxisFinetuneRecord[teethType]
        );
        const newInvMat4 = invertMatrix4x4(newMat4);

        // 转换依赖点集, 需要用到旧的mat4, 但可以化简
        // [toothFix]: mat2,mat4 -> 常规变换 invMat4(旧) * invMat2 * mat2 * mat4(新)
        // 化简 = invMat4(旧) * mat4(新)
        // [bracketFix]: invMat3, mat2, mat4 -> 常规变换 invMat4(旧) * invMat2 * mat3 * invMat3 * mat2 * mat4(新)
        // 化简 = invMat4(旧) * mat4(新)
        for (let name of bracketNamesOfTargetTeethType) {
            applyCalMatrix["dependingTrans"][name] = multiplyMatrix4x4(
                userMatrixList.invMat4[teethType],
                newMat4
            );
        }

        // 更新mat4和invMat4
        userMatrixList.mat4[teethType] = newMat4;
        userMatrixList.invMat4[teethType] = newInvMat4;
        // 其它数据更新
        let applyMatrixType = {};
        switch (fineTuneMode) {
            case "simToothFix": {
                // 模拟排牙-牙齿固定
                // 托槽
                applyMatrixType.bracket = ["mat1", "mat3","mat6", "mat2", "mat4"];
                // 牙齿/坐标轴/距离线/距离文字
                applyMatrixType.tad = ["mat6", "mat2", "mat4"];
                // 轴点反映射(现牙齿->原牙齿)
                applyMatrixType.sphereReversrProj = ["invMat4", "invMat2", "invMat6"];
                // 牙弓线
                applyMatrixType.arch = ["mat4"];
                // 牙齿坐标系
                applyMatrixType.teethAxisSphere = ["mat5", "mat4"];
                break;
            }
            case "simBracketFix": {
                // 模拟排牙-托槽固定
                // 托槽
                applyMatrixType.bracket = ["mat1", "mat6", "mat2", "mat4"];
                // 牙齿/坐标轴/距离线/距离文字
                applyMatrixType.tad = ["invMat3", "mat6", "mat2", "mat4"];
                // 轴点反映射(现牙齿->原牙齿), 是tad的逆矩阵
                applyMatrixType.sphereReversrProj = ["invMat4", "invMat2", "invMat6", "mat3"];
                // 牙弓线
                applyMatrixType.arch = ["mat4"];
                // 牙齿坐标系
                applyMatrixType.teethAxisSphere = ["mat5", "mat4"];
                break;
            }
        }
        // 根据上述各种matType计算矩阵
        Object.keys(applyMatrixType).forEach((typeKey) => {
            // bracket,tad,sphereReversrProj,arch,teethAxisSphere
            // 牙弓线/牙齿坐标系以upper,lower为键, 其它的都以托槽颗数为键
            if (["arch", "teethAxisSphere"].includes(typeKey)) {
                const matList = [];
                for (let matType of applyMatrixType[typeKey]) {
                    // matType: identity/mat1/...
                    matList.push(userMatrixList[matType][teethType]);
                }
                applyCalMatrix[typeKey][teethType] = multiplyMatrixList4x4(
                    matList
                );
            } else {
                for (let name of bracketNamesOfTargetTeethType) {
                    const matList = [];
                    for (let matType of applyMatrixType[typeKey]) {
                        // mat4, invMat4, mat5共用一个矩阵
                        matList.push(
                            ["mat4", "invMat4", "mat5"].includes(matType)
                                ? userMatrixList[matType][teethType]
                                : userMatrixList[matType][name]
                        );
                    }
                    applyCalMatrix[typeKey][name] = multiplyMatrixList4x4(
                        matList
                    );
                }
            }
        });
    }

    return {
        userMatrixList,
        applyCalMatrix,
        teethAxisFinetuneRecord,
        initUserMatrixList,
        initApplyCalMatrix,
        updateSingleBracketUserMatrix,
        initMatrixForTeethAxisSphere,
        updateMatrixWhenFineTuneTeethPosition,
        updateMatrixAfterArrangeTeeth,
        updateApplyUserMatrixWhenSwitchMode,
    };
}
