// import {
//     add,
//     subtract,
//     cross,
//     multiplyScalar,
//     normalize,
//     degreesFromRadians,
//     angleBetweenVectors,
//     solveLeastSquares,
// } from "@kitware/vtk.js/Common/Core/Math";
import {
    add,
    subtract,
    cross,
    multiplyScalar,
    normalize,
    degreesFromRadians,
    angleBetweenVectors,
    solveLeastSquares,
} from "../reDesignVtk/Math"
import { useStore } from "vuex";
import vtkMatrixBuilder from "@kitware/vtk.js/Common/Core/MatrixBuilder";
import SubArrangeWorker from "./subLRArrange.worker";
import {
    calculateProjectWidthOfTooth,
    moveToothDataAlongArchByImpactTest,
    calculateRigidBodyTransMatrix,
    transformSingleToothData,
    calculateArchY,
    calculateArchDerivate,
    findMatchPair,
    generateTeethAxisByNormal,
} from "./arrangeFunc";
import { presetArrangeDataList } from "../static_config";

// 注: 主线程和子线程传递复杂数据类型为深拷贝, 传的不是地址引用!

// 排牙时的子线程, 负责上颌牙或者下颌牙中的一种
let targetTeethType = "";
let subArrangeWorkerL = "";
let subArrangeWorkerR = "";
const store = useStore();
const arrangeOrder = {
    // 排牙的顺序, 列出上颌牙和下颌牙在屏幕中展示时, 从左到右的顺序, 作为后续key读取的参考
    omit: [
        "R7",
        "R6",
        "R5",
        "R4",
        "R3",
        "R2",
        "R1",
        "L1",
        "L2",
        "L3",
        "L4",
        "L5",
        "L6",
        "L7",
    ],
    recoverToothName: {},
};

// 预定义最终生成的牙弓线横截面长宽
const translateDiv_Y = 0.63; // 高度在定义的坐标y轴上平移
const translateDiv_Z = 0.5; // 宽度在z轴上平移

let arrangeState = {
    // 用于记录数据(避免线程之间多次传递, 只来回传一次减少耗时)
    0: {
        sourceData: {
            segPolyDatas: {},
            fineTunedBracketData: {},
            longAxisData: {},
        },
        lockDentalArch: false, // 如果锁定, 则代表主线程用户调整过牙弓线, 此时进入[step0-特殊], 且[step5]不返回牙弓线
        SlicedFlag: false,
    },
    1: {
        transSegData: {},
    },
    2: {
        teethAxis: null,
        coEfficients: [],
        adjustedCoefficients: [], // 调整牙弓线参数
        dentalArchSettings: { W: 0, axisCoord: 0, zLevelOfArch: 0 },
        archPolyData: {},
    },
    3: {
        Order: {
            L: [],
            R: [],
        },
    },
    4: {
        arrangePosition: {},
    },
};

/**
 * @description 检测当前托槽位置较上一次模拟排牙是否发生变化, 同时更新上一次记录
 * 首次进入时上一次里没记录, 也会返回[发生变化]
 * 如果上颌牙/下颌牙没有一个托槽数据也会跳过排牙
 * @param preFineTuneRecord 上次托槽微调的记录
 * @param currFineTuneRecord 当次托槽微调信息
 */
function isFineTuneRecordChanged(preFineTuneRecord, currFineTuneRecord) {
    for (let toothName of Object.keys(currFineTuneRecord)) {
        if (!preFineTuneRecord[toothName]) {
            // 如果没记录, 则[发生改变]
            return true;
        }
        for (let recordKey of Object.keys(currFineTuneRecord[toothName])) {
            // recordKey: [center, xNormal, yNormal, zNormal]
            if (
                !isSameCoord3D(
                    currFineTuneRecord[toothName][recordKey],
                    preFineTuneRecord[toothName][recordKey]
                )
            ) {
                return true;
            }
        }
    }
    // 未检测到任何数据变化(或者没有数据是空的)
    return false;
}
function isSameCoord3D(coord1, coord2) {
    return (
        coord1[0] === coord2[0] &&
        coord1[1] === coord2[1] &&
        coord1[2] === coord2[2]
    );
}

/**
 * @description 是否存在两对对应牙齿如L1/R1和L6/R6这样的两对, 构造牙齿坐标系需要这样两对
 * 直接算出它们的中心点
 */
function calculateCenterFrontAndBehind(longAxisData) {
    const matchToothPair = findMatchPair(Object.keys(longAxisData)); // prior越小, 越精确, 为2=1+1时就是两个源数据
    matchToothPair.sort((a, b) => a.index - b.index); // 1,2,3,4,5,6,7
    // 得到所有prior(从小到大)
    let prior = matchToothPair.map((item) => item.prior);
    prior = [...new Set(prior)];
    prior.sort((a, b) => a - b);
    let centerPair = { front: -1, behind: -1 };
    let match_firstPrior = matchToothPair.filter(
        (item) => item.prior === prior[0]
    );
    if (match_firstPrior.length >= 2) {
        centerPair = {
            front: match_firstPrior[0].index,
            behind: match_firstPrior[match_firstPrior.length - 1].index,
        };
    } else {
        // 只有1个优先级最高的, 还需要从下一优先级中取1个数据
        let match_secondPrior = matchToothPair.filter(
            (item) => item.prior === prior[1]
        );
        // 取距离最大的一对, 所以只需要考虑match_secondPrior中的最小和最大
        if (
            match_firstPrior[0].index - match_secondPrior[0].index >
            match_secondPrior[match_secondPrior.length - 1].index -
                match_firstPrior[0].index
        ) {
            centerPair = {
                front: match_secondPrior[0].index,
                behind: match_firstPrior[0].index,
            };
        } else {
            centerPair = {
                front: match_firstPrior[0].index,
                behind: match_secondPrior[match_secondPrior.length - 1].index,
            };
        }
    }
    let centerLoc = {
        front: { L: [0, 0, 0], R: [0, 0, 0] },
        behind: { L: [0, 0, 0], R: [0, 0, 0] },
    };
    for (let type of ["front", "behind"]) {
        for (let LR of ["L", "R"]) {
            const toothName = `${LR}${centerPair[type]}`;
            if (longAxisData[toothName]) {
                // 有就直接取
                centerLoc[type][LR] = longAxisData[toothName].locationPoint;
            } else {
                // 没有就平均
                add(
                    longAxisData[
                        arrangeOrder.omit[
                            arrangeOrder.omit.indexOf(toothName) - 1
                        ]
                    ].locationPoint,
                    longAxisData[
                        arrangeOrder.omit[
                            arrangeOrder.omit.indexOf(toothName) + 1
                        ]
                    ].locationPoint,
                    centerLoc[type][LR]
                );
                multiplyScalar(centerLoc[type][LR], 0.5);
            }
        }
    }
    let center = { front: [0, 0, 0], behind: [0, 0, 0] };
    for (let type of ["front", "behind"]) {
        add(centerLoc[type].L, centerLoc[type].R, center[type]);
        multiplyScalar(center[type], 0.5);
    }
    return center;
}
/**
 * @description 构造牙齿初始坐标系
 * 注意上颌牙和下颌牙在屏幕中全都是从左到右为L7,...L1,R1,...,R7, 且牙齿前方都指向屏幕外,
 * 因此计算出来的坐标系xNormal和yNormal全部相同, 但是上颌牙zNormal指向下方, 下颌牙zNormal指向上方
 * 但是问题不大, 因为我们之后的牙弓线计算全部和zNormal没关系, 都是在xOy平面上完成的2D计算
 * @param longAxisData {UL1...} / {LL1...}
 * @return axis: {
 *  xNormal: 左右(+x:右方/L7->R7),
 *  yNormal: 前后(+y:前方/左右最内侧牙中点->左右门牙中点,
 *  zNormal: 上下(+z:牙尖(上颌牙朝下, 下颌牙朝上)),
 *  origin： 左右最内侧牙中点再沿YNormal(归一化)往内侧偏移2个单位->牙弓深度D偏移补偿2，牙齿冠中心与末端的偏移
 * }
 */
function generateTeethAxis(longAxisData) {
    // ------------------------------------------------------------------------
    // 计算z轴
    // ------------------------------------
    // z轴指向上下, 通过2个长轴点+1个长轴中点计算法向量
    // ------------------------------------------------------------------------
    // 获得一个大平面, 刚好在牙齿高度一半横切过去, 设置三个顶点为长轴中心点(L6/L7, R6/R7, L1R1线段中点)(优先6)
    // p1: L6/L7长轴中心点locationCoor
    // p2: R6/R7长轴中心点locationCoor
    // p3: L1,R1的长轴中心点取平均

    // 获得一个大平面, 刚好在牙齿高度一半横切过去, 设置三个顶点为长轴中心点
    const teethNameList = Object.keys(longAxisData);
    teethNameList.sort(
        (a, b) => arrangeOrder.omit.indexOf(a) - arrangeOrder.omit.indexOf(b)
    );
    // R7, ..., R1, L1, ... , L7
    // p1, p2取两个极端点的值
    const p1ToothName = teethNameList[0];
    const p2ToothName = teethNameList[teethNameList.length - 1];
    const p3ToothName = teethNameList[Math.round(teethNameList.length / 2)];
    const p1 = longAxisData[p1ToothName].locationPoint;
    const p2 = longAxisData[p2ToothName].locationPoint;
    const p3 = longAxisData[p3ToothName].locationPoint;

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
    subtract(
        longAxisData[p3ToothName].startPoint,
        longAxisData[p3ToothName].endPoint,
        zPlusDirection
    );
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
    // 注意此处x轴直接作为牙弓线对称轴, 一定要指向两颗中间牙的中间, 假设排牙拔了其中一颗门牙, 即[..., R2, L1, ...]
    // 那之后作为两个门牙的的就是R2+L1, 排牙的时候这两个作为首次排牙的牙齿
    // ------------------------------------------------------------------------

    // 后方中心点: 读取牙齿列表, 从7开始, 找R7+L7, 缺1缺2就继续找R6+L6, 直到找到R1+L1
    // 寻找两对距离最大的匹配点, 构造向前的向量
    const {
        front: centerFront,
        behind: centerBehind,
    } = calculateCenterFrontAndBehind(longAxisData);

    // 计算向前的y轴
    const frontNormal = [0, 0, 0];
    subtract(centerFront, centerBehind, frontNormal); // centreBehind->centerFront

    // 通过叉乘计算x轴
    const xNormal = [0, 0, 0];
    cross(frontNormal, zNormal, xNormal);

    // 设置xAxis的正向指向右侧, 与L7->R7(L6->R6)成锐角
    // 大于90度则反向180度
    if (degreesFromRadians(angleBetweenVectors(p12, xNormal)) < 90) {
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
    // 原点由centerBehind决定, 但最好使得L1R1中点的x坐标为0
    // 它后续的fixP, 且为后续排牙的分界线/出发点, L和R以此坐标向左右延伸排牙
    // 原点计算主要是以centerBehind为基准, 沿xNormal方向移动, 让L1R1中点, 即后续的fixP的横坐标为0
    // 由于门牙有时候会被拔掉, L1R1不一定有, 如果有的话, 就是centerFront
    // ------------------------------------------------------------------------
    const center = [centerBehind[0], centerBehind[1], centerBehind[2]];

    // ------------------------------------------------------------------------
    // 计算坐标系
    // ------------------------------------------------------------------------
    return {
        xNormal,
        yNormal,
        zNormal,
        center,
        teethAxis: generateTeethAxisByNormal(center, xNormal, yNormal, zNormal),
    };
}

/**
 * @description 计算 W, axisCoord, zLevelOfArch
 * W: 牙弓线actor的长度(只需计算一次), 依据: 单齿分割数据 取最左最右+5
 * axisCoord: 0(只需计算一次), 固定为0, 依据: 无
 * zLevelOfArch: 牙弓线的z坐标平面(只需计算一次), 依据: 最靠近门牙的两颗单齿长轴数据的locationPoint取平均
 */
function generateDentalArchSettings(toothPointsDatas, longAxisData) {
    // 求取牙齿的大边框,求出 W, D, 固定点
    // 求取所有牙齿点的x范围, 如果之前的坐标系转换很正规, 这里其实只要最左和最右拿去计算边界就够了
    let allToothBound = [Infinity, -Infinity]; // [xMin, xMax]
    // transSegData排序, 只取最左和最右牙齿
    const teethNameList = Object.keys(toothPointsDatas);
    teethNameList.sort(
        (a, b) =>
            arrangeOrder.omit.indexOf(a.substring(1)) -
            arrangeOrder.omit.indexOf(b.substring(1))
    );
    // R7, ..., R1, L1, ... , L7
    // <-----------------------x
    // 最左牙齿决定范围下限
    const sizeL =
        toothPointsDatas[teethNameList[teethNameList.length - 1]].length;
    for (let i = 0; i < sizeL; i += 3) {
        allToothBound[0] = Math.min(
            toothPointsDatas[teethNameList[teethNameList.length - 1]][i],
            allToothBound[0]
        );
    }
    // 最右牙齿决定范围上限
    const sizeR = toothPointsDatas[teethNameList[0]].length;
    for (let i = 0; i < sizeR; i += 3) {
        allToothBound[1] = Math.max(
            toothPointsDatas[teethNameList[0]][i],
            allToothBound[1]
        );
    }

    const W = allToothBound[1] - allToothBound[0] + 5; // xmax-xmin->左右最大距离 + 5(牙弓线画出来向左右延伸出一点头)

    // axisCoord和zLevelOfArch应该是L1R1中点的x坐标和z坐标
    // axisCoord: 牙齿沿x轴分左右部分进行排牙的起始坐标, 基本是牙弓线的对称轴(虽然牙弓线可能不对称)
    // 参照坐标轴计算, 此处应该是0
    // zLevelOfArch: 作为牙弓线所在的平面, 所有托槽都会被转移到这个平面上
    // 考虑到拔门牙的情况, 如果没有L1/R1, 则按照最接近门牙的左右两颗牙托槽中点平均
    const axisCoord = 0;
    // L1 ... L7
    let leftToothName = teethNameList.filter((n) => n.includes("L"));
    let Lz = longAxisData[leftToothName[0]].locationPoint[2];
    // R7 ... R1
    let rightToothName = teethNameList.filter((n) => n.includes("R"));
    let Rz =
        longAxisData[rightToothName[rightToothName.length - 1]]
            .locationPoint[2];
    const zLevelOfArch = (Lz + Rz) / 2;
    return {
        W,
        axisCoord,
        zLevelOfArch,
    };
}

function setInitDataSettingsWithGivenData(data) {
    dataInitPreprocessWithoutBracketData();
    return calculateAndTransformWithData(data);
}
function computeInitDateSettingsFull() {
    dataInitPreprocessWithoutBracketData();
    return calculateAndTransformWithoutData();
}

/**
 * @description 对所有数据应用指定变换
 * @param transSegData 待转换的数据, 包括bracketMatrix(我们最终返回给主线程的转换结果就是这个转换矩阵)
 * @param matrix 转换矩阵
 * @param transName 指定转换哪些数据
 */
function transformAllData(
    transSegData,
    matrix,
    transName = ["tooth", "bracket", "longAxis", "bracketMatrix"]
) {
    Object.keys(transSegData).forEach((toothName) => {
        transformSingleToothData(transSegData[toothName], matrix, transName);
    });
}

/**
 * @description 计算牙弓线方程(4次多项式 y=a0+a1x+a2x^2+a3x^3+a4x^4)
 * @param teethData typedTransSegData
 * @param symmetry 要求对称, 牙弓线对称则要求f(x) = f(-x) => a1=a3=0
 * @return [[a0], [a1], [a2], [a3], [a4]]
 */
function calculateArchFunc(teethData, symmetry = true) {
    // 拟合数据为所有托槽中心点
    const fittingData = [];
    Object.keys(teethData).forEach((toothName) => {
        fittingData.push([
            teethData[toothName].bracketMatrix.center[0],
            teethData[toothName].bracketMatrix.center[1],
        ]); // 只需要 x,y
    });
    const numberOfSamples = fittingData.length;
    const x = []; // (numberOfSamples, 5)
    const y = []; // (numberOfSamples, 1) eg: [[0],[0],[0],[0],[0]]

    let m = [[0], [0], [0], [0], [0]]; // (5, 1)
    
    for (let i = 0; i < numberOfSamples; i++) {
        x.push([]);
        y.push([fittingData[i][1]]);
        for (let j = 0; j < 5; j++) {
            x[i].push(fittingData[i][0] ** j);
        }
    }
    solveLeastSquares(numberOfSamples, x, 5, y, 1, m, true);

    // const fittingData1 = [
    //     [1, 2],
    //     [2, 5],
    //     [3, 10],
    //     [4, 17],
    //     [5, 26],
    // ];
    // console.log('##', fittingData1[0][0])
    
    // // 构造 x 和 y 矩阵
    // const x1 = []; // (numberOfSamples, 3) 对应于 1, x, x^2
    // const y1 = []; // (numberOfSamples, 1)
    // const m1 = [[0], [0], [0]]; // (3, 1) 需要计算的系数
    
    // for (let i = 0; i < 5; i++) {
    //     console.log('##fitting', fittingData1[i][0])
    //     x1.push([
    //         1, // 常数项
    //         fittingData1[i][0], // x
    //         fittingData1[i][0] ** 2, // x^2
    //     ]);
    //     y1.push([fittingData1[i][1]]);
    // }
    
    // // 计算拟合系数
    // console.log(x1)
    // console.log(y1)
    // solveLeastSquares(5, x1, 3, y1, 1, m1, true);
    
    // // 输出结果
    // console.log('拟合系数:', m1);

    // 如果要求对称, 则将奇数次项置0
    if (symmetry) {
        m[1][0] = 0; // a1=0
        m[3][0] = 0; // a3=0
    }
    return m;
}

/**
 * @description 根据参数画出牙弓线(弯曲的立方体), 最终点数为resolution*4
 * @param coEfficients 系数 => y=a0+a1x+a2x^2+a3x^3+a4x^4
 * @param W 牙齿左右最大距离+5, 牙弓线选取的x范围
 * @param axisCoord 轴点, 对称轴坐标, 虽然算出来的牙弓线不一定对称
 * @param zLevelOfArch 牙弓线所在z平面
 * @param resolution 牙弓线分辨率, 即牙弓线从左端到右端共取多少个点(间隔相同x)
 */
function generateArchSpline(
    coEfficients,
    W,
    axisCoord,
    zLevelOfArch,
    resolution = 1000
) {
    // 牙弓线上一共从左端点到右端点, 取resolution个点, 则两点间间隔 x = W / (resolution-1)
    let stepSize = W / (resolution - 1); // 在范围之内, 从xMin开始, 均匀取点
    let initX = -W / 2 + axisCoord; // 牙弓线选取范围左端点
    // 构造牙弓线点集数据
    const archPointsData = new Float32Array(resolution * 3);
    for (let step = 0; step < resolution; step++) {
        // 每个stepSize的距离获得牙弓线上的点坐标[x, y ,z], 根据4次多项式计算牙弓线上的坐标y, 根据zLevelOfArch获得牙弓线所在z平面
        const x = initX + step * stepSize;
        const y = calculateArchY(x, coEfficients);
        const z = zLevelOfArch;
        const pointOffset = step * 3;
        archPointsData[pointOffset] = x;
        archPointsData[pointOffset + 1] = y;
        archPointsData[pointOffset + 2] = z;
    }
    // 由于牙弓线拟合的托槽中心似乎是托槽底面点, 所以如果要构造一个弯曲的立方体, 则计算出来的点集实际分布于立方体连接两个底面的一个侧面中线轴
    // 从牙弓线向下, 向上, 向下向径向, 向上向径向分别延伸， 可以得到构造立方体的全部顶点(4条侧边)
    // 牙弓线向上延伸 translateDiv_Z / 2
    const archUpBehindPoints = new Float32Array(resolution * 3);
    // 牙弓线向下延伸 translateDiv_Z / 2
    const archBelowBehindPoints = new Float32Array(resolution * 3);
    // 牙弓线向上延伸 translateDiv_Z / 2, 向前(径向)延伸 translateDiv_Y
    const archUpFrontPoints = new Float32Array(resolution * 3);
    // 牙弓线向下延伸 translateDiv_Z / 2, 向前(径向)延伸 translateDiv_Y
    const archBelowFrontPoints = new Float32Array(resolution * 3);

    for (let step = 0; step < resolution; step++) {
        const pointOffset = step * 3;
        const [x, y, z] = archPointsData.subarray(pointOffset, pointOffset + 3);

        // 利用切线方向和z轴方向计算径向方向
        // f'(x) = dy/dx, 若dx = 1, 则 dy = 2, 而z=0, 因为在一个平面上
        const tangentialNormal = [1, calculateArchDerivate(x, coEfficients), 0];
        normalize(tangentialNormal);
        const radicalNormal = [0, 0, 0];
        cross(
            tangentialNormal, // 利用导数计算该点切线方向
            [0, 0, 1], // z轴方向经过转换后
            radicalNormal
        );
        // 使径向指向牙弓线外侧(前方)
        if (
            degreesFromRadians(angleBetweenVectors(radicalNormal, [0, 1, 0])) >
            90
        ) {
            multiplyScalar(radicalNormal, -1);
        }
        // 归一化
        normalize(radicalNormal);

        archUpBehindPoints[pointOffset] = x;
        archUpBehindPoints[pointOffset + 1] = y;
        archUpBehindPoints[pointOffset + 2] = z + translateDiv_Z / 2;

        archBelowBehindPoints[pointOffset] = x;
        archBelowBehindPoints[pointOffset + 1] = y;
        archBelowBehindPoints[pointOffset + 2] = z - translateDiv_Z / 2;

        archUpFrontPoints[pointOffset] = x + translateDiv_Y * radicalNormal[0];
        archUpFrontPoints[pointOffset + 1] =
            y + translateDiv_Y * radicalNormal[1];
        archUpFrontPoints[pointOffset + 2] =
            z + translateDiv_Z / 2 + translateDiv_Y * radicalNormal[2];

        archBelowFrontPoints[pointOffset] =
            x + translateDiv_Y * radicalNormal[0];
        archBelowFrontPoints[pointOffset + 1] =
            y + translateDiv_Y * radicalNormal[1];
        archBelowFrontPoints[pointOffset + 2] =
            z - translateDiv_Z / 2 + translateDiv_Y * radicalNormal[2];
    }
    // 构造组合数据
    const archComposedPoints = new Float32Array(resolution * 3 * 4);
    // 需要几个面片:
    // 一个底面需要4个顶点
    // 一个侧面需要每次取出4个点, 构造一个小长方体, 如:
    // 第0次: 4条边, 取4个点, 0-ub0, 1-uf0, 2-bf0, 3-bb0 -> 构造1个面片, 底面0123
    // 第1次: 4条边, 取4个点, 4-ub1, 5-uf1, 6-bf1, 7-bb1 -> 构造4个面片,
    // ub0-ub1-uf1-uf0(0-4-5-1),
    // uf0-uf1-bf1-bf0(1-5-6-2),
    // bf0-bf1-bb1-bb0(2-6-7-3),
    // bb0-bb1-ub1-ub0(3-7-4-0),
    // 第2次: 4条边, 取4个点, 8-ub2, 9-uf2, 10-bf2, 11-bb2 -> 构造4个面片,
    // ub1-ub2-uf2-uf1(4-8-9-5),
    // uf1-uf2-bf2-bf1(5-9-10-6),
    // bf1-bf2-bb2-bb1(6-10-11-7),
    // bb1-bb2-ub2-ub1(7-11-8-4),
    // 第n次: 4条边, 取4个点, 4n-ub[n], 4n+1-uf[n], 4n+2-bf[n], 4n+3-bb[n] -> 构造4个面片,
    // ub[n-1]-ub[n]-uf[n]-uf[n-1](4n-4 - 4n - 4n+1 - 4n-3),
    // uf[n-1]-uf[n]-bf[n]-bf[n-1](4n-3 - 4n+1 - 4n+2 - 4n-2),
    // bf[n-1]-bf[n]-bb[n]-bb[n-1](4n-2 - 4n+2 - 4n+3 - 4n-1),
    // bb[n-1]-bb[n]-ub[n]-ub[n-1](4n-1 - 4n+3 - 4n - 4n-4),
    // 第step=res-1次: 4条边, 取4个点, step*4-ub[step], step*4+1-uf[step], step*4+3-bf[step], step*4+3-bb[step]
    // -> 构造1个面片, 底面step*4,step*4+1,step*4+2,step*4+3
    // -> 构造4个面片, ...

    // 共需要面片数 1 + 4*(resolution-1) + 1 = 4*resolution - 2
    const numCells = 4 * resolution - 2;
    const archCellValue = new Uint32Array((4 + 1) * numCells); // +1用于指示面片数量
    let cellOffset = 0;
    for (let step = 0; step < resolution; step++) {
        // 获取数据
        const readPointOffset = step * 3; // 1次读取3个数据为一个点坐标
        const ub = archUpBehindPoints.subarray(
            readPointOffset,
            readPointOffset + 3
        );
        const uf = archUpFrontPoints.subarray(
            readPointOffset,
            readPointOffset + 3
        );
        const bf = archBelowFrontPoints.subarray(
            readPointOffset,
            readPointOffset + 3
        );
        const bb = archBelowBehindPoints.subarray(
            readPointOffset,
            readPointOffset + 3
        );
        // 存入点集
        let savePointOffset = step * 12; // 1次存入12个数据为4个点坐标
        archComposedPoints[savePointOffset++] = ub[0];
        archComposedPoints[savePointOffset++] = ub[1];
        archComposedPoints[savePointOffset++] = ub[2];
        archComposedPoints[savePointOffset++] = uf[0];
        archComposedPoints[savePointOffset++] = uf[1];
        archComposedPoints[savePointOffset++] = uf[2];
        archComposedPoints[savePointOffset++] = bf[0];
        archComposedPoints[savePointOffset++] = bf[1];
        archComposedPoints[savePointOffset++] = bf[2];
        archComposedPoints[savePointOffset++] = bb[0];
        archComposedPoints[savePointOffset++] = bb[1];
        archComposedPoints[savePointOffset++] = bb[2];
        // 存入面片
        const pointId = step * 4; // 1次存入4个点
        if (step === 0) {
            // 构造底面面片
            archCellValue[cellOffset++] = 4; // 4个顶点组成一个面片
            archCellValue[cellOffset++] = pointId;
            archCellValue[cellOffset++] = pointId + 1;
            archCellValue[cellOffset++] = pointId + 2;
            archCellValue[cellOffset++] = pointId + 3;
        } else if (step === resolution - 1) {
            // 构造底面面片+侧面面片
            // 构造底面面片
            archCellValue[cellOffset++] = 4; // 4个顶点组成一个面片
            archCellValue[cellOffset++] = pointId;
            archCellValue[cellOffset++] = pointId + 1;
            archCellValue[cellOffset++] = pointId + 2;
            archCellValue[cellOffset++] = pointId + 3;
            // 构造侧面面片
            // ub[n-1]-ub[n]-uf[n]-uf[n-1](4n-4 - 4n - 4n+1 - 4n-3)
            archCellValue[cellOffset++] = 4;
            archCellValue[cellOffset++] = pointId - 4;
            archCellValue[cellOffset++] = pointId;
            archCellValue[cellOffset++] = pointId + 1;
            archCellValue[cellOffset++] = pointId - 3;
            // uf[n-1]-uf[n]-bf[n]-bf[n-1](4n-3 - 4n+1 - 4n+2 - 4n-2)
            archCellValue[cellOffset++] = 4;
            archCellValue[cellOffset++] = pointId - 3;
            archCellValue[cellOffset++] = pointId + 1;
            archCellValue[cellOffset++] = pointId + 2;
            archCellValue[cellOffset++] = pointId - 2;
            // bf[n-1]-bf[n]-bb[n]-bb[n-1](4n-2 - 4n+2 - 4n+3 - 4n-1)
            archCellValue[cellOffset++] = 4;
            archCellValue[cellOffset++] = pointId - 2;
            archCellValue[cellOffset++] = pointId + 2;
            archCellValue[cellOffset++] = pointId + 3;
            archCellValue[cellOffset++] = pointId - 1;
            // bb[n-1]-bb[n]-ub[n]-ub[n-1](4n-1 - 4n+3 - 4n - 4n-4)
            archCellValue[cellOffset++] = 4;
            archCellValue[cellOffset++] = pointId - 1;
            archCellValue[cellOffset++] = pointId + 3;
            archCellValue[cellOffset++] = pointId;
            archCellValue[cellOffset++] = pointId - 4;
        } else {
            // 构造侧面面片
            // ub[n-1]-ub[n]-uf[n]-uf[n-1](4n-4 - 4n - 4n+1 - 4n-3)
            archCellValue[cellOffset++] = 4;
            archCellValue[cellOffset++] = pointId - 4;
            archCellValue[cellOffset++] = pointId;
            archCellValue[cellOffset++] = pointId + 1;
            archCellValue[cellOffset++] = pointId - 3;
            // uf[n-1]-uf[n]-bf[n]-bf[n-1](4n-3 - 4n+1 - 4n+2 - 4n-2)
            archCellValue[cellOffset++] = 4;
            archCellValue[cellOffset++] = pointId - 3;
            archCellValue[cellOffset++] = pointId + 1;
            archCellValue[cellOffset++] = pointId + 2;
            archCellValue[cellOffset++] = pointId - 2;
            // bf[n-1]-bf[n]-bb[n]-bb[n-1](4n-2 - 4n+2 - 4n+3 - 4n-1)
            archCellValue[cellOffset++] = 4;
            archCellValue[cellOffset++] = pointId - 2;
            archCellValue[cellOffset++] = pointId + 2;
            archCellValue[cellOffset++] = pointId + 3;
            archCellValue[cellOffset++] = pointId - 1;
            // bb[n-1]-bb[n]-ub[n]-ub[n-1](4n-1 - 4n+3 - 4n - 4n-4)
            archCellValue[cellOffset++] = 4;
            archCellValue[cellOffset++] = pointId - 1;
            archCellValue[cellOffset++] = pointId + 3;
            archCellValue[cellOffset++] = pointId;
            archCellValue[cellOffset++] = pointId - 4;
        }
    }
    // 设置输出
    return { archPointsData: archComposedPoints, archCellsData: archCellValue };
}

/**
 * @description 计算从startX坐标向+x或-x移动一段距离后, 该段距离所截得的曲线长度恰好等于length, 返回此时的x坐标,
 * 即计算一个定积分的上限或者下限, 然而4次多项式的线段长度无法计算定积分, 所以需要用近似0.01的小线段叠加, 得到一个近似准确的移动距离,
 * 注意, 这样的计算只有L1R1是需要的, 后续移动的初始位置反正都要变, 不如别用这种方法
 * @param length 定积分的值
 * @param startX 开始的x坐标, 定积分已知的的上限或者下限
 * @param direction +1/-1, +1代表startX是下限, 从startX往+x走, -1代表startX是上限, 从startX往-x走
 * @param coEfficients 定义4次多项式的系数 y=a0+a1x+a2x^2+a3x^3+a4x^4
 */
function calculateArchPositionByFixedLength(
    length,
    startX,
    direction,
    coEfficients
) {
    // 限定计算范围, 因为从同一个x1到x2, 曲线肯定大于等于直线长度
    let rangeStart = startX;
    let rangeEnd = startX;
    if (direction === 1) {
        // +x方向, startX作为积分下限 [startX, startX+length]
        rangeEnd += length;
    } else {
        // -x方向, startX作为积分上限 [startX-length, startX]
        rangeStart -= length;
    }
    let sum = 0;
    let dx = 0.001;
    let prevY = calculateArchY(rangeStart, coEfficients);
    let findX = rangeStart;
    for (let x = rangeStart; x < rangeEnd; x += dx) {
        // 每次向前x累加0.01的量, 计算距离
        const currY = calculateArchY(x, coEfficients);
        const dDist = Math.sqrt(dx ** 2 + (currY - prevY) ** 2);
        // 如果此时的length卡在这一步和下一步之间, 就比较哪一步的累加更近
        if (sum < length && sum + dDist >= length) {
            findX = length - sum < sum + dDist - length ? x - dx : x;
            break;
        }
        sum += dDist;
    }
    return findX;
}

/**
 * @description [Step0]-初始存入数据, 并激活上/下颌牙并行排牙开始,
 * 接受的参数须直接是上颌牙或者下颌牙的数据, 不要都传过来, 减少数据传输的耗时
 * @param segPolyDatas 牙齿和托槽的polyData源数据(里面是点集, Float32Array)
 * @param preFineTuneRecord 上次托槽微调记录
 * @param fineTunedBracketData 当前微调托槽源数据
 * @param force 即使数据相同也会继续进行排牙
 */
function asyncArrangeTheTeeth(preFineTuneRecord, fineTunedBracketData, SlicedFlag, SlicedTeethDatas, force) {
    const retData = {
        step: 0, // 当前执行第0步
        toNext: false,
    };
    // 未检测到变化时直接跳过排牙
    // preFineTuneRecord在worker关掉后会清掉, 需要在这一步一起传过来对比！(该记录应该存在主线程中)
    if (preFineTuneRecord && !SlicedFlag) {
        // 如果传preFineTuneRecord, 就比较, 没变化就跳过所有步骤
        if (!isFineTuneRecordChanged(preFineTuneRecord, fineTunedBracketData)) {
            retData.step = 6; // 准备跳过所有步骤
            return retData;
        }
    }
    // if (!isFineTuneRecordChanged(preFineTuneRecord, fineTunedBracketData) && !force) {
    //     retData.step = 6; // 准备跳过所有步骤
    //     return retData;
    // }
    // 少于5个托槽无法排牙, 且左右需要各有至少1个托槽
    if (
        Object.keys(fineTunedBracketData).length < 5 ||
        findMatchPair(
            Object.keys(fineTunedBracketData).map((name) => name.substring(1))
        ).length < 2
    ) {
        retData.step = 6; // 准备跳过所有步骤
        return retData;
    }

    arrangeState["0"].sourceData = {
        ...arrangeState["0"].sourceData,
        fineTunedBracketData,
        segPolyDatas: {
            ...arrangeState["0"].sourceData.segPolyDatas,
            tooth: SlicedTeethDatas,
        }
    };
    retData.toNext = true; // 准备执行下一步
    return retData;
}

/**
 * @description [Step1]-数据预处理(深拷贝数据+托槽初始移动)
 */
function dataPreprocess() {
    const retData = {
        step: 1, // 当前执行第1步
        toNext: false,
    };
    const { segPolyDatas, fineTunedBracketData, longAxisData } = arrangeState[
        "0"
    ].sourceData;
    // ------------------------------------------------------------------------
    // 复制参数(深拷贝)
    // ------------------------------------------------------------------------
    // 初始化-只有同时有4个数据才是有效的数据
    let transSegData = {};
    for (let toothName of Object.keys(fineTunedBracketData)) {
        if (
            segPolyDatas.tooth[toothName] &&
            segPolyDatas.bracket[toothName] &&
            longAxisData[toothName] &&
            fineTunedBracketData[toothName]
        ) {
            // 为方便遍历, 将key设置为省略模式(UL1->L1, LL1->L1)
            arrangeOrder.recoverToothName[toothName.slice(1)] = toothName; // 用于后续恢复牙齿名, 重新加上前缀
            const omitToothName = toothName.slice(1);
            transSegData[omitToothName] = {};
            // ------------------------------------------------------------------------
            // 深拷贝牙齿polyData
            // ------------------------------------------------------------------------
            transSegData[omitToothName].toothPointsData = new Float32Array(
                segPolyDatas.tooth[toothName]
            );
            // ------------------------------------------------------------------------
            // 深拷贝托槽polyData
            // ------------------------------------------------------------------------
            transSegData[omitToothName].bracketPointsData = new Float32Array(
                segPolyDatas.bracket[toothName]
            );
            // ------------------------------------------------------------------------
            // 深拷贝长轴数据
            // ------------------------------------------------------------------------
            const { startPoint, locationPoint, endPoint } = longAxisData[
                toothName
            ];
            transSegData[omitToothName].longAxis = {
                startPoint: [startPoint[0], startPoint[1], startPoint[2]],
                locationPoint: [
                    locationPoint[0],
                    locationPoint[1],
                    locationPoint[2],
                ],
                endPoint: [endPoint[0], endPoint[1], endPoint[2]],
            };
            // ------------------------------------------------------------------------
            // 深拷贝托槽数据
            // ------------------------------------------------------------------------
            const { center, xNormal, yNormal, zNormal } = fineTunedBracketData[
                toothName
            ];
            transSegData[omitToothName].bracketMatrix = {
                center: [center[0], center[1], center[2]],
                xNormal: [xNormal[0], xNormal[1], xNormal[2]],
                yNormal: [yNormal[0], yNormal[1], yNormal[2]],
                zNormal: [zNormal[0], zNormal[1], zNormal[2]],
            };
            // 托槽位置为(0,0,0), 首先需根据托槽当前法向量进行托槽坐标系的转换
            // 根据当前微调结果进行转换
            const initTransformMat = calculateRigidBodyTransMatrix(
                [
                    1,
                    0,
                    0, // 上下
                    0,
                    1,
                    0, // 前后
                    0,
                    0,
                    1, // 左右
                ],
                [
                    center[0] + yNormal[0],
                    center[1] + yNormal[1],
                    center[2] + yNormal[2],
                    center[0] + zNormal[0],
                    center[1] + zNormal[1],
                    center[2] + zNormal[2],
                    center[0] + xNormal[0],
                    center[1] + xNormal[1],
                    center[2] + xNormal[2],
                ]
            );
            // 对托槽点集应用变换
            vtkMatrixBuilder
                .buildFromDegree()
                .setMatrix(initTransformMat)
                .apply(transSegData[omitToothName].bracketPointsData);
        }
    }

    // 存入数据
    arrangeState["1"].transSegData = transSegData;
    // 返回数据
    retData.toNext = true; // 准备执行第2步
    return retData;
}
/**
 * @description 仅转换 牙齿和长轴
 */
function dataInitPreprocessWithoutBracketData() {
    const { segPolyDatas, longAxisData } = arrangeState["0"].sourceData;
    // ------------------------------------------------------------------------
    // 复制参数(深拷贝)
    // ------------------------------------------------------------------------
    // 初始化-只有同时有4个数据才是有效的数据
    let transSegData = {};
    for (let toothName of Object.keys(segPolyDatas.tooth)) {
        if (
            segPolyDatas.tooth[toothName] &&
            segPolyDatas.bracket[toothName] &&
            longAxisData[toothName]
        ) {
            // 为方便遍历, 将key设置为省略模式(UL1->L1, LL1->L1)
            arrangeOrder.recoverToothName[toothName.slice(1)] = toothName; // 用于后续恢复牙齿名, 重新加上前缀
            const omitToothName = toothName.slice(1);
            transSegData[omitToothName] = {};
            // ------------------------------------------------------------------------
            // 深拷贝牙齿polyData
            // ------------------------------------------------------------------------
            transSegData[omitToothName].toothPointsData = new Float32Array(
                segPolyDatas.tooth[toothName]
            );
            // ------------------------------------------------------------------------
            // 深拷贝长轴数据
            // ------------------------------------------------------------------------
            const { startPoint, locationPoint, endPoint } = longAxisData[
                toothName
            ];
            transSegData[omitToothName].longAxis = {
                startPoint: [startPoint[0], startPoint[1], startPoint[2]],
                locationPoint: [
                    locationPoint[0],
                    locationPoint[1],
                    locationPoint[2],
                ],
                endPoint: [endPoint[0], endPoint[1], endPoint[2]],
            };
        }
    }
    // 存入数据
    arrangeState["1"].transSegData = transSegData;

    // 构造排牙顺序
    arrangeOrder.L = [];
    arrangeOrder.R = [];
    for (let toothName of Object.keys(transSegData)) {
        arrangeOrder[toothName[0]].push(toothName);
    }
    // 排序, 从小到大 L1->L7, R1->R7
    arrangeOrder.L.sort((a, b) => a[1] - b[1]);
    arrangeOrder.R.sort((a, b) => a[1] - b[1]);
}

/**
 * @description [Step2]-计算牙齿标准坐标系, 牙弓线函数, 牙弓线函数X范围, L1R1中间点
 * 注意此处计算数据需要返回主线程保存, 下次进入页面时直接根据这些数据计算actor和矩阵
 * 涉及相关数据:
 * coEfficients: 牙弓线四次多项式(不断更新), 依据:托槽位置
 * W: 牙弓线actor的长度(只需计算一次), 依据: 单齿分割数据 取最左最右+5
 * axisCoord: 0(只需计算一次), 固定为0, 依据: 无
 * zLevelOfArch: 牙弓线的z坐标平面(只需计算一次), 依据: 最靠近门牙的两颗单齿长轴数据的locationPoint取平均
 */
function calculateDentalArchFunction() {
    const retData = {
        step: 2, // 当前执行第2步
        toNext: false,
        dentalArchSettings: { coEfficients: null },
    };
    // ------------------------------------------------------------------------
    // 读取对应牙齿类型数据
    // ------------------------------------------------------------------------
    let transSegData = arrangeState["1"].transSegData;

    let teethAxis = arrangeState["2"].teethAxis;
    const teethAxisTransformMat = calculateRigidBodyTransMatrix(teethAxis, [
        1,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        targetTeethType === "upper" ? -1 : 1,
        0,
        0,
        0,
    ]);
    // 对所有点集和特定坐标和对应bracketMatrix应用变换
    transformAllData(transSegData, teethAxisTransformMat);

    // ------------------------------------------------------------------------
    // 根据转换数据求牙弓线(4次多项式)->得益于之前坐标系转换, 该方程与z轴无关, 纯粹是xOy上的2维曲线
    // ------------------------------------------------------------------------
    const coEfficients = calculateArchFunc(transSegData, true); // [a0, a1, a2, a3, a4]
    // ------------------------------------------------------------------------
    // 画出牙弓线(立方体)
    // ------------------------------------------------------------------------
    let { W, axisCoord, zLevelOfArch } = arrangeState["2"].dentalArchSettings;

    // ------------------------------------------------------------------------
    // 计算牙弓线的polyData(弯曲的立方体)(输出点集和面片结构)供后续显示用
    // ------------------------------------------------------------------------
    const { archPointsData, archCellsData } = generateArchSpline(
        coEfficients,
        W,
        axisCoord,
        zLevelOfArch
    );

    // 存入数据
    arrangeState["2"].coEfficients = coEfficients;
    arrangeState["2"].archPolyData = { archPointsData, archCellsData };

    // 返回数据
    retData.dentalArchSettings.coEfficients = coEfficients;
    retData.toNext = true; // 准备执行第3步
    return retData;
}

/**
 * @description 根据主线程数据, 计算teethAxis, W, axisCoord, zLevelOfArch
 * 将对应数据返回主线程供后续保存
 */
function calculateAndTransformWithoutData() {
    const retData = {
        step: "Init",
        teethAxis: null,
        dentalArchSettings: {
            W: 0,
            axisCoord: 0,
            zLevelOfArch: 0,
        },
    };
    // ------------------------------------------------------------------------
    // 读取对应牙齿类型数据
    // ------------------------------------------------------------------------
    let transSegData = arrangeState["1"].transSegData;

    // ------------------------------------------------------------------------
    // 构造牙齿坐标系(x, y, z, origin) 并转换数据
    // 其中zNormal的意义就在于把托槽近似到一个面上, 让后续操作变成二维的计算
    // 而xNormal和yNormal就作为后续建立牙弓线方程的基础, 如果坐标轴偏转过大, 那求出来的多项式就会很奇怪, 因为坐标轴旋转可能对函数的影响很大
    // 所以按二次多项式的思路, x轴和y轴的选取就要正规
    // 不管缺多少牙, 牙齿的位置基本是不变的, 所以y轴基本还是要沿着L7/R7->L1/R1的方向, x轴基本从L7->R7
    // ------------------------------------------------------------------------
    let { xNormal, yNormal, zNormal, center, teethAxis } = generateTeethAxis(
        Object.fromEntries(
            Object.entries(transSegData).map(([omitToothName, data]) => [
                omitToothName,
                data.longAxis,
            ])
        )
    );
    arrangeState["2"].teethAxis = teethAxis;
    retData.teethAxis = { xNormal, yNormal, zNormal, center };
    // 构造刚体变换(从原始坐标系->标准坐标系)
    // 变换后相当于将整个牙齿搬到一个标准的坐标系里, 此时的牙弓线被搬到类似于y=1-x^2的方向上, 更容易计算
    // 不能反着来, 不然就等于牙齿偏了两倍
    // 上下颌牙全部从牙齿的坐标系转到标准坐标系, 此时每个点的坐标直接就是投影坐标
    // * 为何上颌牙要取负:
    // * 我们计算出来的两个矩阵是用于刚体变换的, 而刚体变换只允许平移+旋转, 不允许翻转, 所以必须关注怎样的坐标系可以让牙齿不翻转
    // * 这就要求我们计算出来的xyz轴方向必须满足一定关系, 一般的xyz关系可以看左下角(r-x,g-y,b-z),
    // * 此时的xyz为+x(1,0,0),+y(0,1,0),+z(0,0,1)
    // * 拿出右手, 手掌从 +x 旋转到 +y, 发现大拇指朝向 +z 的方向,
    // * 通过计算, 下颌牙坐标系近似于+x(-1,0,0),+y(0,-1,0),+z(0,0,1), 相当于r和g反一下, 屏幕旋转180度可以得到, 满足右手定则不会翻转
    // * 而上颌牙坐标系+x(-1,0,0),+y(0,-1,0),+z(0,0,-1)不满足右手定则(在屏幕中怎么旋转都得不到, 必须翻转一次),
    // * 而刚体变换又不允许翻转，所以坐标变换的时候就会出现意外,
    // * 可以试试, 此时得到center和3个方向为(0.5,0.5,0.5)(0.833, -0.167, -0.167)(-0.167, 0.833, -0.167)(-0.167, -0.167, 0.833)
    // * 此时我们对目标坐标系或原坐标系任意一个轴取负就可以了
    const teethAxisTransformMat = calculateRigidBodyTransMatrix(teethAxis, [
        1,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        targetTeethType === "upper" ? -1 : 1,
        0,
        0,
        0,
    ]);
    // 对牙齿点和长轴点和对应bracketMatrix应用变换
    transformAllData(transSegData, teethAxisTransformMat, [
        "tooth",
        "longAxis",
    ]);
    // 求取牙齿的大边框,求出 W, D, 固定点
    // 求取所有牙齿点的x范围, 如果之前的坐标系转换很正规, 这里其实只要最左和最右拿去计算边界就够了
    let allToothBound = [Infinity, -Infinity]; // [xMin, xMax]
    // transSegData排序, 只取最左和最右牙齿
    const teethNameList = Object.keys(transSegData);
    teethNameList.sort(
        (a, b) => arrangeOrder.omit.indexOf(a) - arrangeOrder.omit.indexOf(b)
    );
    // R7, ..., R1, L1, ... , L7
    // <-----------------------x
    // 最左牙齿决定范围下限
    const sizeL =
        transSegData[teethNameList[teethNameList.length - 1]].toothPointsData
            .length;
    for (let i = 0; i < sizeL; i += 3) {
        allToothBound[0] = Math.min(
            transSegData[teethNameList[teethNameList.length - 1]]
                .toothPointsData[i],
            allToothBound[0]
        );
    }
    // 最右牙齿决定范围上限
    const sizeR = transSegData[teethNameList[0]].toothPointsData.length;
    for (let i = 0; i < sizeR; i += 3) {
        allToothBound[1] = Math.max(
            transSegData[teethNameList[0]].toothPointsData[i],
            allToothBound[1]
        );
    }

    const W = allToothBound[1] - allToothBound[0] + 5; // xmax-xmin->左右最大距离 + 5(牙弓线画出来向左右延伸出一点头)

    // axisCoord和zLevelOfArch应该是L1R1中点的x坐标和z坐标
    // axisCoord: 牙齿沿x轴分左右部分进行排牙的起始坐标, 基本是牙弓线的对称轴(虽然牙弓线可能不对称)
    // 参照坐标轴计算, 此处应该是0
    // zLevelOfArch: 作为牙弓线所在的平面, 所有托槽都会被转移到这个平面上
    // 考虑到拔门牙的情况, 如果没有L1/R1, 则按照最接近门牙的左右两颗牙托槽中点平均
    const axisCoord = 0;
    let Lz = [0, 0, 0];
    let Rz = [0, 0, 0];
    for (let i = 7; i >= 0; i--) {
        if (Object.keys(transSegData).includes(`L${i}`)) {
            Lz = transSegData[`L${i}`].longAxis.locationPoint[2];
        }
        if (Object.keys(transSegData).includes(`R${i}`)) {
            Rz = transSegData[`R${i}`].longAxis.locationPoint[2];
        }
    }
    const zLevelOfArch = (Lz + Rz) / 2;

    // 存入数据
    arrangeState["2"].dentalArchSettings = { W, axisCoord, zLevelOfArch };

    retData.dentalArchSettings = { W, axisCoord, zLevelOfArch };

    // 返回数据
    return retData;
}
/**
 * @description 根据主线程给出数据, 直接计算teethAxis, 保存W, axisCoord, zLevelOfArch
 */
function calculateAndTransformWithData(data) {
    // 保存给出的数据(坐标轴得进一步处理一下)
    let {
        teethAxis: { xNormal, yNormal, zNormal, center },
        dentalArchSettings: { W, axisCoord, zLevelOfArch },
    } = data;
    let teethAxis = generateTeethAxisByNormal(
        center,
        xNormal,
        yNormal,
        zNormal
    );
    arrangeState["2"].teethAxis = teethAxis;
    arrangeState["2"].dentalArchSettings = { W, axisCoord, zLevelOfArch };
}

/**
 * @description [Step3]-对L1, R1进行排牙
 */
function calculateL1R1Position() {
    const retData = {
        step: 3, // 当前为第3步
        data: {},
        toNext: false,
    };
    // ------------------------------------------------------------------------
    // 读取对应牙齿类型数据
    // ------------------------------------------------------------------------
    const transSegData = arrangeState["1"].transSegData;
    const {
        dentalArchSettings: { axisCoord, zLevelOfArch },
    } = arrangeState["2"];
    // 依赖的牙弓线参数: 锁定牙弓线排牙则是adjustedCoEfficients, 正常排牙则是coEfficients
    let coEfficients = arrangeState["0"].lockDentalArch
        ? arrangeState["2"].adjustedCoEfficients
        : arrangeState["2"].coEfficients;
    // let coEfficients;
    // if (arrangeState["0"].lockDentalArch) {
    //     coEfficients = arrangeState["2"].adjustedCoEfficients;
    // }
    // else {
    //     if (arrangeState["2"].coEfficients.length != 0) {
    //         coEfficients = arrangeState["2"].coEfficients;
    //     }
    //     else {
    //         coEfficients = arrangeState["2"].adjustedCoEfficients;
    //     }
    //     // arrangeState["2"].coEfficients;
    // }
    // console.log('coefficient', coEfficients)
    // console.log(arrangeState["2"].adjustedCoEfficients)
    // console.log(arrangeState["2"].coEfficients)
    // 排牙从首位开始向两边排, 使每一个托槽中心都在牙弓线上, 且牙齿点集之间互相不重叠
    // 且设置完成后牙齿的三法向量和托槽的三法向量一致
    // ------------------------------------------------------------------------
    // 左右端首位排牙
    // ------------------------------------------------------------------------
    // widthL1: L1牙齿点集在托槽xNormal方向上的宽度
    // L1 初步定位: 牙齿宽度一半(取一半是由于我们定位的是托槽中心在牙弓线上的位置)
    const widthL1 = calculateProjectWidthOfTooth(
        transSegData[arrangeOrder.L[0]].bracketMatrix.xNormal,
        transSegData[arrangeOrder.L[0]].toothPointsData
    );
    // 初始定位, fixedP定为L1R1中心, +x为L7->R7 左边牙齿往-x方向走从L1->L7, 右边牙齿往+x走从R1->R7
    const initXL1 = calculateArchPositionByFixedLength(
        widthL1 / 2,
        axisCoord,
        -1,
        coEfficients
    );

    // R1初步定位
    const widthR1 = calculateProjectWidthOfTooth(
        transSegData[arrangeOrder.R[0]].bracketMatrix.xNormal,
        transSegData[arrangeOrder.R[0]].toothPointsData
    );
    const initXR1 = calculateArchPositionByFixedLength(
        widthR1 / 2,
        axisCoord,
        1,
        coEfficients
    );

    // 初始定位的initXL1和initXR1, 可能会有牙齿重叠一部分或者隔开一部分空隙, 通过碰撞检测去微调
    // 在微调的过程中, 数据也会跟随变换, 返回微调定位后的x坐标

    const {
        finalXL: finalXL1,
        finalXR: finalXR1,
    } = moveToothDataAlongArchByImpactTest(
        coEfficients,
        zLevelOfArch,
        targetTeethType === "upper" ? -1 : 1,
        { left: initXL1, right: initXR1 },
        {
            left: transSegData[arrangeOrder.L[0]],
            right: transSegData[arrangeOrder.R[0]],
        },
        true,
        true
    ); // 注意函数内部会转换牙齿数据

    // ------------------------------------------------------------------------
    // 记录数据
    // ------------------------------------------------------------------------
    arrangeState["4"].arrangePosition[arrangeOrder.L[0]] = {
        position: finalXL1,
        width: widthL1,
    };
    arrangeState["4"].arrangePosition[arrangeOrder.R[0]] = {
        position: finalXR1,
        width: widthR1,
    };
    // ------------------------------------------------------------------------
    // 根据现有数据, 对后续排牙顺序进行初始化
    // ------------------------------------------------------------------------
    arrangeState["3"].Order.L = arrangeOrder.L;
    arrangeState["3"].Order.R = arrangeOrder.R;
    retData.toNext = true; // 准备执行第4步
    retData.data = {
        arrangeDataL1: { position: finalXL1, width: widthL1 },
        arrangeDataR1: { position: finalXR1, width: widthR1 },
        L: {
            total: arrangeState["3"].Order.L.length,
            finish: 1,
        },
        R: {
            total: arrangeState["3"].Order.R.length,
            finish: 1,
        },
    };
    return retData;
}

/**
 * @description [Step5]-根据完成数据准备返回各个数据的pointsData(牙弓线+托槽+牙齿)和cellData(牙弓线)
 * 在主线程中复制原来的cellData共同组成新的polyData并构造actor
 * 每个牙齿的排牙结果在bracketMatrix中, 保存下来之后, 下次进入页面直接跳过排牙, 应用该转换矩阵
 */
function sortTransToothData() {
    // ------------------------------------------------------------------------
    // 读取数据
    // ------------------------------------------------------------------------
    // 读取牙齿+托槽点集
    const transSegData = arrangeState["1"].transSegData;
    // // 读取牙弓线数据+牙齿坐标系
    // const { archPolyData, teethAxis } = arrangeState["2"];
    // 读取牙齿坐标系
    const { teethAxis } = arrangeState["2"];
    // ------------------------------------------------------------------------
    // 各点集转换回原始坐标系
    // ------------------------------------------------------------------------
    const reverseTeethAxisTransformMat = calculateRigidBodyTransMatrix(
        [1, 0, 0, 0, 1, 0, 0, 0, targetTeethType === "upper" ? -1 : 1, 0, 0, 0],
        teethAxis
    );
    // const matTransformer = vtkMatrixBuilder
    //     .buildFromDegree()
    //     .setMatrix(reverseTeethAxisTransformMat);
    // // 应用于牙弓线点集
    // matTransformer.apply(archPolyData.archPointsData);
    // 应用于bracketMatrix
    transformAllData(transSegData, reverseTeethAxisTransformMat, [
        "bracketMatrix",
    ]);
    // 返回转换完成的数据
    // const retData = {
    //     step: 5,
    //     data: { arch: archPolyData },
    //     arrangeMatrix: {},
    // };
    const retData = {
        step: 5,
        data: {},
        arrangeMatrix: {},
    };
    Object.keys(transSegData).forEach((toothName) => {
        // (L1->UL1/LL1)
        const fullToothName = arrangeOrder.recoverToothName[toothName];
        retData.arrangeMatrix[fullToothName] =
            transSegData[toothName].bracketMatrix;
    });
    // 返回牙弓线(锁定牙弓线时不作该操作)
    // 读取锁定牙弓线
    const { lockDentalArch } = arrangeState["0"];
    retData.lockDentalArch = lockDentalArch; // 主线程onmessage中操作会因这个参数有所区别(bracketMatrix是否覆盖)
    if (!lockDentalArch) {
        // 读取牙弓线数据
        const { archPolyData } = arrangeState["2"];
        const matTransformer = vtkMatrixBuilder
            .buildFromDegree()
            .setMatrix(reverseTeethAxisTransformMat);
        // 应用于牙弓线点集
        matTransformer.apply(archPolyData.archPointsData);
        // 返回
        retData.data.arch = archPolyData;
    }
    return retData;
}

/**
 * @description [Step6]-根据排牙完成数据构造actor(由于无法传递vtkPolyData, 该操作在主线程中完成)
 */

/**
 * @description [Step-enterAtInitTime]-根据得到的数据直接构造牙弓线数据然后返回
 */
function generateArchPolyData(coEfficients) {
    // 计算标准坐标系下的牙弓线数据
    const {
        dentalArchSettings: { W, axisCoord, zLevelOfArch },
        teethAxis,
    } = arrangeState["2"];
    const { archPointsData, archCellsData } = generateArchSpline(
        coEfficients,
        W,
        axisCoord,
        zLevelOfArch
    );
    // 转换回原始坐标系
    const reverseTeethAxisTransformMat = calculateRigidBodyTransMatrix(
        [1, 0, 0, 0, 1, 0, 0, 0, targetTeethType === "upper" ? -1 : 1, 0, 0, 0],
        teethAxis
    );
    const matTransformer = vtkMatrixBuilder
        .buildFromDegree()
        .setMatrix(reverseTeethAxisTransformMat);
    // 应用于牙弓线点集
    matTransformer.apply(archPointsData);
    // 返回
    return {
        step: "enterAtInitTime",
        data: { arch: { archPointsData, archCellsData } },
    };
}

/**
 * @description 接收孙线程返回的数据, 然后转发给主线程, 更新进度
 * 主线程如果发现牙还没排完, 会向本线程发出 step 4 的指令,
 *  然后本线程再转发指令给孙线程, 孙线程开始排下一颗牙
 */
function onReceiveSubArrangeWorkerMessage(event) {
    const step = event.data.step;
    switch (step) {
        case 4: {
            // 保存数据
            const {
                toothLoc,
                finish,
                bracketMatrix,
                // arrangeData,
                // currTooth: { toothName },
            } = event.data.data;
            arrangeState["1"].transSegData[
                arrangeState["3"].Order[toothLoc][finish - 1]
            ].bracketMatrix = bracketMatrix;
            // arrangeState["4"].arrangePosition[toothName] = arrangeData;
            // 向主线程传输数据
            self.postMessage({
                step: 4, // 当前为第4步
                data: {
                    toothLoc,
                    finish,
                    // arrangeData,
                },
            });
            break;
        }
        default:
            break;
    }
}

/**
 * @description [step-特殊]: 用于调整牙弓线, 从主线程接收每个托槽中心, 然后开始计算牙弓线, 并生成牙弓线actor
 * 全程不会覆盖arrangeState中的牙弓线参数
 */
function recalculateDentalArch(event) {
    // 托槽中心转换
    let teethAxis = arrangeState["2"].teethAxis;
    const teethAxisTransformMat = calculateRigidBodyTransMatrix(teethAxis, [
        1,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        targetTeethType === "upper" ? -1 : 1,
        0,
        0,
        0,
    ]);
    let transSegData = event.data;
    // 对bracketMatrix变换到标准坐标系
    transformAllData(transSegData, teethAxisTransformMat, ["bracketMatrix"]);
    // 计算牙弓线
    const coEfficients = calculateArchFunc(transSegData, true); // [a0, a1, a2, a3, a4]
    // 存入数据
    arrangeState["2"].coEfficients = coEfficients;
    // 生成牙弓线数据
    let { W, axisCoord, zLevelOfArch } = arrangeState["2"].dentalArchSettings;

    // ------------------------------------------------------------------------
    // 计算牙弓线的polyData(弯曲的立方体)(输出点集和面片结构)供后续显示用
    // ------------------------------------------------------------------------
    const { archPointsData, archCellsData } = generateArchSpline(
        coEfficients,
        W,
        axisCoord,
        zLevelOfArch
    );
    const reverseTeethAxisTransformMat = calculateRigidBodyTransMatrix(
        [1, 0, 0, 0, 1, 0, 0, 0, targetTeethType === "upper" ? -1 : 1, 0, 0, 0],
        teethAxis
    );
    const matTransformer = vtkMatrixBuilder
        .buildFromDegree()
        .setMatrix(reverseTeethAxisTransformMat);
    // 应用于牙弓线点集
    matTransformer.apply(archPointsData);

    return {
        step: "reCalculateDentalArch",
        coEfficients,
        arch: { archPointsData, archCellsData },
    };
}

function reScaleDentalArch(event) {
    // 托槽中心转换
    let teethAxis = arrangeState["2"].teethAxis;
    
    const coEfficients = event.data; // [a0, a1, a2, a3, a4]
    // 生成牙弓线数据
    let { W, axisCoord, zLevelOfArch } = arrangeState["2"].dentalArchSettings;

    // ------------------------------------------------------------------------
    // 计算牙弓线的polyData(弯曲的立方体)(输出点集和面片结构)供后续显示用
    // ------------------------------------------------------------------------
    const { archPointsData, archCellsData } = generateArchSpline(
        coEfficients,
        W,
        axisCoord,
        zLevelOfArch
    );
    const reverseTeethAxisTransformMat = calculateRigidBodyTransMatrix(
        [1, 0, 0, 0, 1, 0, 0, 0, targetTeethType === "upper" ? -1 : 1, 0, 0, 0],
        teethAxis
    );
    const matTransformer = vtkMatrixBuilder
        .buildFromDegree()
        .setMatrix(reverseTeethAxisTransformMat);
    // 应用于牙弓线点集
    matTransformer.apply(archPointsData);

    return {
        step: "reCalculateDentalArch",
        coEfficients,
        arch: { archPointsData, archCellsData },
    };
}

function usePresetDentalArch(event) {
    // 托槽中心转换
    let teethAxis = arrangeState["2"].teethAxis;

    const selectedPreset = event.data
    const curPreset = presetArrangeDataList.filter((item)=>{
		return item.number == selectedPreset
	})[0]
    const coEfficients = curPreset[targetTeethType].dentalArchSettings.coEfficients; // [a0, a1, a2, a3, a4]
    // 生成牙弓线数据
    let { W, axisCoord, zLevelOfArch } = arrangeState["2"].dentalArchSettings;

    // ------------------------------------------------------------------------
    // 计算牙弓线的polyData(弯曲的立方体)(输出点集和面片结构)供后续显示用
    // ------------------------------------------------------------------------
    const { archPointsData, archCellsData } = generateArchSpline(
        coEfficients,
        W,
        axisCoord,
        zLevelOfArch
    );
    const reverseTeethAxisTransformMat = calculateRigidBodyTransMatrix(
        [1, 0, 0, 0, 1, 0, 0, 0, targetTeethType === "upper" ? -1 : 1, 0, 0, 0],
        teethAxis
    );
    const matTransformer = vtkMatrixBuilder
        .buildFromDegree()
        .setMatrix(reverseTeethAxisTransformMat);
    // 应用于牙弓线点集
    matTransformer.apply(archPointsData);

    return {
        step: "reCalculateDentalArch",
        coEfficients,
        arch: { archPointsData, archCellsData },
    };
}

// /**
//  * @description [step0-特殊]: 锁定牙弓线排牙, 在主线程中, 用户调整牙弓线后, 针对当前调整完毕的牙弓线进行排牙, 则此时进行的操作,
//  * 包括step1的【转换数据】、step2【 对所有点集和特定坐标和对应bracketMatrix转换到标准坐标系】  然后跳到step3直接开始排牙
//  * 在step5中, 如果指定过lock CoEfficients, 则默认只返回排牙转换矩阵, 不返回牙弓线数据
//  * 注意锁定牙弓线时从主线程接收的数据中应该包括coEfficients, 直接覆盖子线程的coEfficients, 并且记录lock CoEfficients
//  */
// function lockDentalArchArrangePreProessing(eventData) {
//     // 读取主线程数据, 覆盖此处数据
//     const {
//         fineTunedBracketData,
//         coEfficients,
//         dentalArchSettings,
//     } = eventData;
//     if (coEfficients) {
//         arrangeState["2"].coEfficients = coEfficients;
//     }
//     if (dentalArchSettings) {
//         Object.assign(arrangeState["2"].dentalArchSettings, dentalArchSettings);
//     }
//     // step0-覆盖托槽微调记录
//     arrangeState["0"].sourceData = {
//         ...arrangeState["0"].sourceData,
//         fineTunedBracketData,
//     };
//     // step1-转换数据
//     dataPreprocess();
//     // step2-根据teethAxis计算转换矩阵, 转换所有数据
//     let transSegData = arrangeState["1"].transSegData;
//     let teethAxis = arrangeState["2"].teethAxis;
//     const teethAxisTransformMat = calculateRigidBodyTransMatrix(teethAxis, [
//         1,
//         0,
//         0,
//         0,
//         1,
//         0,
//         0,
//         0,
//         targetTeethType === "upper" ? -1 : 1,
//         0,
//         0,
//         0,
//     ]);
//     // 对所有点集和特定坐标和对应bracketMatrix应用变换
//     transformAllData(transSegData, teethAxisTransformMat);
//     // 告知主线程开始step3排牙
//     return {
//         step: 2, // 当前执行第2步
//         toNext: true, // 可以执行下一步
//         dentalArchSettings: {}, // 传一个空对象回去(即没有配置参数需要更新, 此时主线程不会更新数据, 代码在actorHandleState.UpdateDentalArchSettings中)
//     };
// }

/**
 * @description [step0-特殊]: 锁定牙弓线排牙, 在主线程中, 用户调整牙弓线后, 针对当前调整完毕的牙弓线进行排牙, 则此时进行的操作,
 * 包括step1的【转换数据】、step2【 对所有点集和特定坐标和对应bracketMatrix转换到标准坐标系】  然后跳到step3直接开始排牙
 * 在step5中, 如果指定过lock CoEfficients, 则默认只返回排牙转换矩阵, 不返回牙弓线数据
 * 该step要求从主线程接收的数据中应该包括coEfficients
 * 触发: 上面板[牙弓线调整]-[更新]/[初始化]
 * 外部调整牙弓线后重新排牙, 或者经过微调后锁定牙弓线排牙时进入此流程, 后者如果没有微调过托槽则不需要继续执行
 */
function preProessingForAdjustedDentalArchArrange(eventData) {
    // 读取主线程数据, 覆盖此处数据
    const { preFineTuneRecord, fineTunedBracketData, coEfficients, SlicedTeethDatas, SlicedFlag } = eventData;
    // step0-覆盖托槽微调记录
    if (preFineTuneRecord) {
        // 如果传preFineTuneRecord, 就比较, 没变化就跳过所有步骤
        if (!isFineTuneRecordChanged(preFineTuneRecord, fineTunedBracketData)) {
            return {
                step: 6 // 跳过所有步骤
            };
        }
    }
    arrangeState["0"].sourceData = {
        ...arrangeState["0"].sourceData,
        fineTunedBracketData,
        segPolyDatas: {
            ...arrangeState["0"].sourceData.segPolyDatas,
        }
    };
    if (SlicedFlag) {
        arrangeState["0"].sourceData = {
            ...arrangeState["0"].sourceData,
            fineTunedBracketData,
            segPolyDatas: {
                ...arrangeState["0"].sourceData.segPolyDatas,
                tooth: SlicedTeethDatas,
            }
        };
    }
    else {
        arrangeState["0"].sourceData = {
            ...arrangeState["0"].sourceData,
            fineTunedBracketData,
            segPolyDatas: {
                ...arrangeState["0"].sourceData.segPolyDatas,
            }
        };
    }
    arrangeState["2"].adjustedCoEfficients = coEfficients;
    
    // step1-转换数据
    dataPreprocess();
    // step2-根据teethAxis计算转换矩阵, 转换所有数据
    let transSegData = arrangeState["1"].transSegData;
    let teethAxis = arrangeState["2"].teethAxis;
    const teethAxisTransformMat = calculateRigidBodyTransMatrix(teethAxis, [
        1,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        targetTeethType === "upper" ? -1 : 1,
        0,
        0,
        0,
    ]);
    // 对所有点集和特定坐标和对应bracketMatrix应用变换
    transformAllData(transSegData, teethAxisTransformMat);
    // 告知主线程开始step3排牙
    return {
        step: 2, // 当前执行第2步
        toNext: true, // 可以执行下一步
        dentalArchSettings: {}, // 传一个空对象回去(即没有配置参数需要更新, 此时主线程不会更新数据, 代码在actorHandleState.UpdateDentalArchSettings中)
    };
}

// 根据给定的牙弓线系数直接开始排牙, 此过程中所有配置保持不变, 直接开始排牙步骤
// 最终排牙完成后仅返回新的排牙转换矩阵, 没有其他新的数据
// 注意由于排牙过程中涉及到各种牙齿托槽数据的移动, 因此step1还是要走
self.onmessage = function(e) {
    switch (e.data.step) {
        case "Init": {
            // 孙子线程
            subArrangeWorkerL = new SubArrangeWorker();
            subArrangeWorkerR = new SubArrangeWorker();
            // 接收worker子线程中的postMessage数据
            subArrangeWorkerL.onmessage = onReceiveSubArrangeWorkerMessage;
            // 接收worker子线程中的postMessage数据
            subArrangeWorkerR.onmessage = onReceiveSubArrangeWorkerMessage;
            // 接收初始数据
            const {
                teethType,
                segPolyDatas,
                longAxisData,
                teethAxis,
                dentalArchSettings: { W, axisCoord, zLevelOfArch },
            } = e.data;
            targetTeethType = teethType;
            // 存入对应数据
            arrangeState["0"].sourceData = {
                ...arrangeState["0"].sourceData,
                segPolyDatas,
                longAxisData,
            };
            // 牙齿坐标系,W,axisCoord,zLevelOfArch-读取自主线程或计算
            if (
                teethAxis &&
                typeof W === "number" &&
                typeof axisCoord === "number" &&
                typeof zLevelOfArch === "number"
            ) {
                // 4个数据齐全时进行如下操作
                // 构造特定格式数据(不包括托槽点集/托槽转换矩阵)
                // 计算牙齿标准坐标系矩阵
                setInitDataSettingsWithGivenData({
                    teethAxis,
                    dentalArchSettings: { W, axisCoord, zLevelOfArch },
                });
                // 什么数据都不用发
            } else {
                // 4个数据不齐全时进行如下操作
                // 构造特定格式数据(不包括托槽点集/托槽转换矩阵)
                // 计算牙齿标准坐标系
                // 计算 W,axisCoord,zLevelOfArch
                let retData = computeInitDateSettingsFull();
                // 把 4个数据返回主线程进行保存, 它们只需要计算一次, 可以提交到服务器保存
                self.postMessage(retData);
            }
            // 向孙子线程发送初始数据
            subArrangeWorkerL.postMessage({
                state: "Init",
                settings: {
                    teethType: targetTeethType,
                    zLevelOfArch:
                        arrangeState["2"].dentalArchSettings.zLevelOfArch,
                    toothLoc: "L",
                },
            });
            subArrangeWorkerR.postMessage({
                state: "Init",
                settings: {
                    teethType: targetTeethType,
                    zLevelOfArch:
                        arrangeState["2"].dentalArchSettings.zLevelOfArch,
                    toothLoc: "R",
                },
            });
            // 注意该操作之后的排牙, 每次传入新的托槽点集并进行标准坐标系转换, 然后可以计算牙弓线
            // 主线程如果已有牙弓线数据和单齿转换矩阵, 则可以选择不排牙, 除非强制更新
            break;
        }
        case 0: {
            // 开始排牙, 这一步主要检测托槽较上次排牙是否微调过, 没有则不需要重新排牙
            // const {
            //     segPolyDatas,
            //     preFineTuneRecord,
            //     fineTunedBracketData,
            //     isDentalArchLocked,
            //     force,
            //     SlicePolyDatas,
            // } = e.data;
            const {
                segPolyDatas,
                preFineTuneRecord,
                fineTunedBracketData,
                isDentalArchLocked,
                force,
                SlicedTeethDatas,
                SlicedFlag,
            } = e.data;
            arrangeState["0"].lockDentalArch = isDentalArchLocked
                ? true
                : false; // 未传参数则为undefined -> false
            arrangeState["0"].SlicedFlag = SlicedFlag;
            if (SlicedTeethDatas) {
                arrangeState["0"].sourceData.segPolyDatas = {
                    ...arrangeState["0"].sourceData.segPolyDatas,
                    tooth: SlicedTeethDatas,
                }
                arrangeState["0"].SlicedFlag = true;
            }
            else {
                arrangeState["0"].SlicedFlag = false;
            }
            if (isDentalArchLocked) {
                // 锁定牙弓线则进入特殊处理流程[step0-特殊]
                // 注意isDentalArchLocked将影响后续排牙所依赖的牙弓线参数
                // self.postMessage(lockDentalArchArrangePreProessing(e.data)); // 包括特别的step012, 后续直接转step3排牙
                self.postMessage(
                    preProessingForAdjustedDentalArchArrange(e.data)
                ); // 包括特别的step012, 后续直接转step3排牙
                return;
            }
            self.postMessage(
                asyncArrangeTheTeeth(preFineTuneRecord, fineTunedBracketData, SlicedFlag, SlicedTeethDatas, force)
            );
            break;
        }
        case 1:
            self.postMessage(dataPreprocess());
            break;
        case 2:
            self.postMessage(calculateDentalArchFunction());
            break;
        case 3: {
            let retData = calculateL1R1Position();
            // 此时coEfficients计算完毕, 同时托槽、牙齿数据全部转换完毕
            // 第一颗左右牙相关数据已经排好了, 注意传position和width
            // 可以整理一下, 统一发给LR两个孙子线程
            let transSegDataEntries = Object.entries(
                arrangeState["1"].transSegData
            ).map(([name, value]) => [
                name,
                {
                    toothPointsData: value.toothPointsData,
                    bracketMatrix: value.bracketMatrix,
                },
            ]);
            let transSegDataL = Object.fromEntries(
                transSegDataEntries.filter(([name]) => name.startsWith("L"))
            );
            let transSegDataR = Object.fromEntries(
                transSegDataEntries.filter(([name]) => name.startsWith("R"))
            );
            // 注意排好的两颗牙传position和width
            Object.assign(
                transSegDataL[arrangeOrder.L[0]],
                arrangeState["4"].arrangePosition[arrangeOrder.L[0]]
            );
            Object.assign(
                transSegDataR[arrangeOrder.R[0]],
                arrangeState["4"].arrangePosition[arrangeOrder.R[0]]
            );
            // 依赖的牙弓线参数: 锁定牙弓线排牙则是adjustedCoEfficients, 正常排牙则是coEfficients
            let coEfficients = arrangeState["0"].lockDentalArch
                ? arrangeState["2"].adjustedCoEfficients
                : arrangeState["2"].coEfficients;
            subArrangeWorkerL.postMessage({
                state: "Init",
                teethData: transSegDataL,
                settings: {
                    coEfficients,
                },
                SlicedFlag: arrangeState["0"].SlicedFlag
            });
            subArrangeWorkerR.postMessage({
                state: "Init",
                teethData: transSegDataR,
                settings: {
                    coEfficients,
                },
                SlicedFlag: arrangeState["0"].SlicedFlag
            });
            self.postMessage(retData);
            break;
        }
        case 4: {
            const { toothLoc, finish } = e.data;
            const prevToothName = arrangeState["3"].Order[toothLoc][finish - 1];
            // const { position, width } = arrangeState["4"].arrangePosition[
            //     prevToothName
            // ];
            const currToothName = arrangeState["3"].Order[toothLoc][finish];
            const SlicedFlag = arrangeState["0"].SlicedFlag;
            const SlicedTeethData = arrangeState["0"].sourceData.segPolyDatas.tooth;
            const postData = {
                state: "arrange",
                // teethType: targetTeethType,
                // toothLoc,
                finish,
                // currTooth: {
                //     toothName: currToothName,
                //     toothData: arrangeState["1"].transSegData[currToothName],
                // },
                // prevTooth: {
                //     toothData: arrangeState["1"].transSegData[prevToothName],
                //     position,
                //     width,
                // },

                // zLevelOfArch: arrangeState["2"].dentalArchSettings.zLevelOfArch,
                // coEfficients: arrangeState["2"].coEfficients,

                currToothName,
                prevToothName,
                // SlicedFlag,
                // SlicedTeethData,
            };
            if (toothLoc === "L") {
                subArrangeWorkerL.postMessage(postData);
            }
            if (toothLoc === "R") {
                subArrangeWorkerR.postMessage(postData);
            }
            break;
        }
        case 5:
            self.postMessage(sortTransToothData());
            break;
        case "enterAtInitTime": // 仅传入新的牙弓线系数, 计算新的牙弓线polydata并返回
            self.postMessage(generateArchPolyData(e.data.coEfficients));
            break;
        case "recalculateDentalArch":
            self.postMessage(recalculateDentalArch(e.data));
            break;
        case "reScaleDentalArch":
            self.postMessage(reScaleDentalArch(e.data));
            break;
        case "usePresetDentalArch":
            self.postMessage(usePresetDentalArch(e.data));
            break;
        case 100:
            subArrangeWorkerL.terminate();
            subArrangeWorkerR.terminate();
            break;
        default:
            break;
    }
};
