import {
    moveToothDataAlongArchByImpactTest,
    calculateProjectWidthOfTooth,
    calculateArchDerivate,
} from "./arrangeFunc";

let settings = {
    teethType: "", // 不变
    toothLoc: "", // 不变
    zLevelOfArch: 0, // 不变
    coEfficients: null, // 每次排牙变化
};
// 注意托槽和单齿数据在该线程中发生转换, 因此每次更新排牙都得重新传入一份
let teethData = {};

/**
 * @description 从父线程中接收牙齿数据并更新
 */
function updateTeethData(transferData) {
    Object.assign(teethData, transferData);
}
/**
 * @description 从父线程中接收牙齿数据并更新
 */
function updateTeethSettings(transferData) {
    Object.assign(settings, transferData);
}

/**
 * @description [Step4]-循环排下一颗牙
 * @param teethType upper | lower
 * @param toothLoc L | R
 * @param finish 索引
 * @param currTooth 当前排牙数据
 * @param prevTooth 上一个排牙数据
 * @param zLevelOfArch
 * @param coEfficients
 */
function arrangeNextTooth(
    // teethType,
    // toothLoc,
    finish,
    // currTooth,
    // prevTooth,
    // zLevelOfArch,
    // coEfficients
    currToothName,
    prevToothName
) {
    const retData = {
        step: 4, // 当前为第4步
        data: {
            toothLoc: settings.toothLoc,
            finish,
            bracketMatrix: [],
        },
    };
    // ------------------------------------------------------------------------
    // 读取数据
    // ------------------------------------------------------------------------
    // const { toothName: currToothName, toothData: currToothData } = currTooth;
    // const {
    //     toothData: prevToothData,
    //     position: prevPosition,
    //     width: prevWidth,
    // } = prevTooth;
    const { teethType, toothLoc, coEfficients, zLevelOfArch } = settings;

    const currToothData = teethData[currToothName];
    const prevToothData = teethData[prevToothName];
    const { position: prevPosition, width: prevWidth } = prevToothData;
    // 牙齿的初始坐标点, 嫌麻烦可以直接设置为上一个固定坐标的点
    // 但这里专业一点, 设置为前一个牙齿宽度+当前牙齿宽度各一半相加, 沿着牙弓线移动
    let currWidth = calculateProjectWidthOfTooth(
        currToothData.bracketMatrix.xNormal,
        currToothData.toothPointsData
    );
    let yd = Math.abs(calculateArchDerivate(prevPosition, coEfficients)); // 求绝对值的 dy/dx就够了
    // 计算式 1/sqrt(1+yd^2) = moveDist/toothWidth
    let moveDist = (prevWidth + currWidth) / 2 / Math.sqrt(1 + yd ** 2);

    let position;
    if (toothLoc === "L") {
        // L排牙: 向-x方向前进, 每次固定右边已经排好的牙齿, 左边随意移动, 直至贴上右边牙齿
        const currInitPosition = prevPosition - moveDist;
        // 国定右牙排左牙
        const {
            finalXL: currFinalPosition,
        } = moveToothDataAlongArchByImpactTest(
            coEfficients,
            zLevelOfArch,
            teethType === "upper" ? -1 : 1,
            { left: currInitPosition, right: prevPosition },
            { left: currToothData, right: prevToothData },
            true,
            false
        );
        position = currFinalPosition;
    } else {
        // R排牙: 向x方向前进, 每次固定左边已经排好的牙齿, 右边随意移动, 直至贴上左边牙齿
        const currInitPosition = prevPosition + moveDist;
        // 国定左牙排右牙
        const {
            finalXR: currFinalPosition,
        } = moveToothDataAlongArchByImpactTest(
            coEfficients,
            zLevelOfArch,
            teethType === "upper" ? -1 : 1,
            { left: prevPosition, right: currInitPosition },
            { left: prevToothData, right: currToothData },
            false,
            true
        );
        position = currFinalPosition;
    }
    // 保存排好的position和width
    Object.assign(teethData[currToothName], {
        position,
        width: currWidth,
    });

    // retData.data.arrangeData = {
    //     toothName: currToothName,
    //     position,
    //     width: currWidth,
    // };
    // retData.data.currTooth = currTooth;
    retData.data.finish++;
    retData.data.bracketMatrix = currToothData.bracketMatrix;
    return retData;
}

self.onmessage = function(e) {
    // 某些数据只需要初始时传一次, 后续排牙时传的仅是两个牙齿名字
    const {
        state,
        // teethType,
        // toothLoc,
        finish,
        // currTooth,
        // prevTooth,
        // zLevelOfArch,
        // coEfficients,
        currToothName,
        prevToothName,
        settings,
        teethData,
    } = e.data;
    switch (state) {
        case "Init":
            if (teethData) {
                updateTeethData(teethData);
            }
            if (settings) {
                updateTeethSettings(settings);
            }
            break;
        case "arrange":
            self.postMessage(
                arrangeNextTooth(
                    // teethType,
                    // toothLoc,
                    finish,
                    // currTooth,
                    // prevTooth,
                    // zLevelOfArch,
                    // coEfficients
                    currToothName,
                    prevToothName
                )
            );
            break;
        default:
            break;
    }
};

export { moveToothDataAlongArchByImpactTest };
