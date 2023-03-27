import {
    angleBetweenVectors,
    cross,
    degreesFromRadians,
    multiplyScalar,
    normalize,
    normalize2D,
} from "@kitware/vtk.js/Common/Core/Math";
import vtkMatrixBuilder from "@kitware/vtk.js/Common/Core/MatrixBuilder";
import vtkPoints from "@kitware/vtk.js/Common/Core/Points";
import vtkLandmarkTransform from "@kitware/vtk.js/Common/Transform/LandmarkTransform";

/**
 * @description 是否存在两对对应牙齿如L1/R1和L6/R6这样的两对, 构造牙齿坐标系需要这样两对
 * 这是排牙条件之一, 最多允许两位近似去补齐托槽, 如L1L3平均近似L2
 */
function findMatchPair(teethNameList) {
    let arrangeOrder = [
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
    ];
    let meanTeethNameList = [];
    // 补全牙齿
    for (let toothName of teethNameList) {
        if (arrangeOrder.indexOf(toothName) <= arrangeOrder.length - 3) {
            const gapToothName =
                arrangeOrder[arrangeOrder.indexOf(toothName) + 2];
            if (teethNameList.includes(gapToothName)) {
                // 如果有两个托槽隔1位, 就通过平均互补出中间托槽数据
                let meanToothName =
                    arrangeOrder[arrangeOrder.indexOf(toothName) + 1]; // 表明该托槽可以用平均数据去近似
                if (!teethNameList.includes(meanToothName)) {
                    // 原托槽数据中不包括该托槽
                    meanTeethNameList.push({ name: meanToothName, prior: 2 });
                }
            }
        }
    }
    // console.log('补', meanTeethNameList)
    let completeTeethNameList = [
        ...teethNameList.map((name) => ({ name, prior: 1 })),
        ...meanTeethNameList,
    ];
    // 寻找对应
    const matchToothPair = [];
    for (let i = 1; i <= 7; i++) {
        let L = completeTeethNameList.filter((item) => item.name === `L${i}`);
        let R = completeTeethNameList.filter((item) => item.name === `R${i}`);
        if (L.length === 1 && R.length === 1) {
            matchToothPair.push({ index: i, prior: L[0].prior + R[0].prior });
        }
    }
    return matchToothPair;
}

/**
 * @description 用于将某一数据(牙齿+托槽)(要求当前在正坐标系下)向牙弓线(正坐标系)上某一点移动,
 * 变换取决于其中托槽, 其余数据依据托槽的变换进行共同变换
 * 源点集就是托槽的3个法向量和中心, 经过变换之后, 要求托槽中心在牙弓线上, 托槽左右方向为牙弓线当前点的切线方向,
 * 托槽前后方向为当前牙弓线的径向方向, 托槽上下方向为当前牙弓线的上下方向,
 * 由于牙弓线在正坐标系中, 因此上下方向就是(0,0,1)(下颌牙)或(0,0,-1)(上颌牙)
 * @param transSingleData 待转换单牙齿数据(牙齿+托槽)
 * @param x 牙弓线x坐标
 * @param coEfficients 定义牙弓线的系数
 * @param zLevelOfArch 用于z坐标的读取
 * @param zDirection -1:上颌牙, 1:下颌牙
 */
function transformSingleDataAlongArch(
    transSingleData,
    x,
    coEfficients,
    zLevelOfArch,
    zDirection
) {
    // 读取托槽方向和中心
    const { center, xNormal, yNormal, zNormal } = transSingleData.bracketMatrix;
    // 构造源点集
    const originalMatrix = [
        center[0] + xNormal[0],
        center[1] + xNormal[1],
        center[2] + xNormal[2],
        center[0] + yNormal[0],
        center[1] + yNormal[1],
        center[2] + yNormal[2],
        center[0] + zNormal[0],
        center[1] + zNormal[1],
        center[2] + zNormal[2],
        center[0],
        center[1],
        center[2],
    ];
    // 计算目标点集
    const targetMatrix = calculateTransMatrixOnArch(
        x,
        coEfficients,
        zLevelOfArch,
        zDirection
    );
    // console.log('中心点移动', center, '->', [targetMatrix[9], targetMatrix[10], targetMatrix[11]])
    // console.log('旋转角度:', degreesFromRadians(angleBetweenVectors(xNormal, [targetMatrix[0]-targetMatrix[9], targetMatrix[1]-targetMatrix[10], targetMatrix[2]-targetMatrix[11]])))
    // 对单牙齿所有数据点集和特定坐标应用变换
    transformSingleToothData(
        transSingleData,
        calculateRigidBodyTransMatrix(originalMatrix, targetMatrix),
        ["tooth", "bracketMatrix"]
    );
}
/**
 * @description 通过碰撞检测的方法, 沿牙弓线为左右两颗相邻牙齿寻找两个点集能刚好贴在一起的坐标点,
 * 过程中, 两个点集将不断发生变换
 * 注：此处不需要投影坐标, 这↑里↓就是标准坐标系
 *
 * 计算当前两点集是否相交确实可以用minSubDist去指示, 但移动距离用minSubDist会太大
 *
 * @param coEfficients 牙弓线系数
 * @param zLevelOfArch 用于z坐标的读取
 * @param zDirection 上颌牙为-1, 下颌牙为1
 * @param initX {left:初始输入时的左牙坐标, right:初始输入时的右牙坐标}
 * @param toothData {left:左边牙齿数据, right:右边牙齿数据}
 * @param isLeftRemovable 左边牙齿是否可移动
 * @param isRightRemovable 右边牙齿是否可移动
 * @param breakCondition 最终两个牙齿点集的距离小于该值则视为贴合
 * @param tolerance 两个点集的z坐标之差在tolerance之内, 被视作相同, y同理
 */
function moveToothDataAlongArchByImpactTest(
    coEfficients,
    zLevelOfArch,
    zDirection,
    initX,
    toothData,
    isLeftRemovable = true,
    isRightRemovable = true,
    breakCondition = 1e-3,
    tolerance = 0.1
) {
    // 根据初始坐标转换牙齿托槽数据
    transformSingleDataAlongArch(
        toothData.left,
        initX.left,
        coEfficients,
        zLevelOfArch,
        zDirection
    );
    transformSingleDataAlongArch(
        toothData.right,
        initX.right,
        coEfficients,
        zLevelOfArch,
        zDirection
    );

    // 由于此处对上颌牙或下颌牙来说, 数据的上下法向量都设置相同, 因此在移动过程中, 不管如何变换, z是不变的
    // 因此在对两个点集的对应点双循环之前, 可以提前构造一层层z的对应关系
    // 可以大大减少后续的循环次数
    // ----------------------------------------
    // 寻找每一个z层对应关系
    // ----------------------------------------
    // let t = Date.now()
    const toothSize = {
        left: toothData.left.toothPointsData.length,
        right: toothData.right.toothPointsData.length,
    };

    // 筛选1: 求两个牙齿的公共z区域, 该区域外所有点不可能重叠故不予考虑
    const zBound = {};
    for (let toothLoc of ["left", "right"]) {
        zBound[toothLoc] = [Infinity, -Infinity];
        for (let i = 0; i < toothSize[toothLoc]; i += 3) {
            zBound[toothLoc][0] = Math.min(
                toothData[toothLoc].toothPointsData[i + 2],
                zBound[toothLoc][0]
            );
            zBound[toothLoc][1] = Math.max(
                toothData[toothLoc].toothPointsData[i + 2],
                zBound[toothLoc][1]
            );
        }
    }
    const commonZBound = [
        Math.max(zBound.left[0], zBound.right[0]),
        Math.min(zBound.left[1], zBound.right[1]),
    ];

    // zLinkMap: 以Left牙为基准, 遍历其中的每个点, 寻找在Right牙中所有与其z坐标相同(差值小于一定值)的对应点
    // 降低循环次数(耗时)的方法 按z轴大小排序
    // 计算 {index:z-value}

    // 筛选2: 根据托槽中心进行筛选, 通过投影到托槽xNormal方向上的坐标, 左牙只取右边一部分, 右牙只取左边一部分
    // 注意+x与托槽xNormal之间由于经过上述变换, 上颌牙托槽xNormal现指向牙弓线切线方向(同向)
    // 下颌牙托槽xNormal现指向牙弓线切线方向反方向(反向)
    // 即上颌牙xNormal计算出来的投影坐标越大, 证明x越大, 即越在右边
    // 上颌牙: 左牙取投影坐标大于其托槽中心投影坐标的一部分, 右牙取投影坐标小于其托槽中心投影坐标的一部分
    // 即下颌牙xNormal计算出来的投影坐标越大, 证明x越小, 即越在左边
    // 下颌牙: 左牙取投影坐标小于其托槽中心投影坐标的一部分, 右牙取投影坐标大于其托槽中心投影坐标的一部分

    // 该index也是后续我们会涉及到的点列表索引
    const indexToZValue = {};
    for (let toothLoc of ["left", "right"]) {
        indexToZValue[toothLoc] = [];
        const { xNormal, center } = toothData[toothLoc].bracketMatrix;
        // console.log('角度', zDirection===-1?'上颌牙':'下颌牙', degreesFromRadians(angleBetweenVectors(xNormal, [1, 0, 0])))
        // 都小于90度
        const xProjBorder = projectToAxis2D(
            [xNormal[0], xNormal[1]],
            [center[0], center[1]]
        );
        for (let i = 0; i < toothSize[toothLoc]; i += 3) {
            const pointOfLoc = [
                toothData[toothLoc].toothPointsData[i],
                toothData[toothLoc].toothPointsData[i + 1],
                toothData[toothLoc].toothPointsData[i + 2],
            ];
            const xProj = projectToAxis2D(
                [xNormal[0], xNormal[1]],
                [pointOfLoc[0], pointOfLoc[1]]
            );
            // 只取z在公共范围, 左牙在其托槽中心的右边部分, 右牙在其托槽中心的左边部分
            if (
                pointOfLoc[2] > commonZBound[0] &&
                pointOfLoc[2] < commonZBound[1] &&
                ((toothLoc === "left" &&
                    zDirection === -1 &&
                    xProj >= xProjBorder) || // 上颌牙同向, 越大, 越右边
                (toothLoc === "left" &&
                    zDirection === 1 &&
                    xProj <= xProjBorder) || // 下颌牙反向, 越小, 越右边
                (toothLoc === "right" &&
                    zDirection === -1 &&
                    xProj <= xProjBorder) || // 上颌牙同向, 越小, 越左边
                    (toothLoc === "right" &&
                        zDirection === 1 &&
                        xProj >= xProjBorder)) // 下颌牙反向, 越大, 越左边
            ) {
                indexToZValue[toothLoc].push({ index: i, z: pointOfLoc[2] });
            }
        }
        // 排序 z值从小到大(从低到高)
        indexToZValue[toothLoc].sort((a, b) => a.z - b.z);
    }
    // // console.log('筛选点', indexToZValueLeft.length, indexToZValueRight.length)
    //
    // // for (let i = 0; i < numToothLeft; i++) {
    // //     const pointOfLeft = [0, 0, 0]
    // //     toothDataLeft.toothPolyData.getPoints().getPoint(i, pointOfLeft)
    // //     if (pointOfLeft[2] > commonZBound[0] && pointOfLeft[2] < commonZBound[1]) {
    // //         indexToZValueLeft.push({index:i, z: pointOfLeft[2]})
    // //     }
    // // }
    // // for (let i = 0; i < numToothRight; i++) {
    // //     const pointOfRight = [0, 0, 0]
    // //     toothDataRight.toothPolyData.getPoints().getPoint(i, pointOfRight)
    // //     if (pointOfRight[2] > commonZBound[0] && pointOfRight[2] < commonZBound[1]) {
    // //         indexToZValueRight.push({index:i, z: pointOfRight[2]})
    // //     }
    // // }

    // 后续构造表计算其实可以无序, 也可以sort一下就和上面一样了
    const linkMapZ = {};
    let zOffsetRight = 0;
    for (let i = 0; i < indexToZValue.left.length; i++) {
        // 循环结束标志
        if (zOffsetRight >= indexToZValue.right.length) {
            break;
        }
        // 得到left点的z值
        const zOfLeftPoint = indexToZValue.left[i];
        linkMapZ[zOfLeftPoint.index] = [];
        // 如果此时left点和right点两个点的z在容差以内则认为对上了, 直接进行push
        // 直到随right点的z不断升高, 高于容差了就停
        if (
            Math.abs(zOfLeftPoint.z - indexToZValue.right[zOffsetRight].z) <
            tolerance
        ) {
            let startOffset = zOffsetRight;
            while (
                indexToZValue.right[startOffset] &&
                Math.abs(zOfLeftPoint.z - indexToZValue.right[startOffset].z) <
                    tolerance
            ) {
                // while循环结束条件: startOffset超出范围(算到末尾时) 或者 容差超出范围(一般情况下)
                linkMapZ[zOfLeftPoint.index].push(
                    indexToZValue.right[startOffset++].index
                );
            }
        } else if (zOfLeftPoint.z > indexToZValue.right[zOffsetRight].z) {
            // 如果不满足容差则有两种情况, 第一种情况时left点比right点高得多(就是指高于容差)
            // 那么就需要通过让zOffsetRight不断增大让right点的z赶上来
            // 循环直至right点的z够上此时的left
            // 之后的循环是不考虑zOffsetRight之前的点的, 就是不考虑比这个点的z还低的点
            // 因为left继续涨, right不往后涨只会大于容差
            while (
                indexToZValue.right[zOffsetRight] &&
                zOfLeftPoint.z - indexToZValue.right[zOffsetRight].z > tolerance
            ) {
                // while循环结束条件: zOffsetRight超出范围(算到末尾时) 或者 容差开始进入范围
                zOffsetRight++;
            }
            // 如果是zOffset算到末尾而退出则不需要再继续往下做了(此时right的z已达最高值而依旧赶不上left的z,继续就没意义了)
            if (zOffsetRight >= indexToZValue.right.length) {
                break;
            }
            // 一般情况下未超出范围, 即随着right的z值升高, 使得其与left之间的z值成功进入容差, 此时进入push
            // 此时zOfLeftPoint.z - indexToZValueRight[zOffsetRight] <= tolerance
            let startOffset = zOffsetRight;
            while (
                indexToZValue.right[startOffset] &&
                Math.abs(zOfLeftPoint.z - indexToZValue.right[startOffset].z) <
                    tolerance
            ) {
                // while循环结束条件: startOffset超出范围(算到末尾时) 或者 容差超出范围(一般情况下)
                linkMapZ[zOfLeftPoint.index].push(
                    indexToZValue.right[startOffset++].index
                );
            }
        }
        // 剩下的情况就是left点比right点要低得多(高于容差)
        // 此时不作操作, 等待i的增长让left点的z勾上right点中目前的最低点z
    }
    // 可排序(其实无意义)
    Object.keys(linkMapZ).forEach((leftIdx) => {
        linkMapZ[leftIdx].sort((a, b) => a - b);
    });

    // console.log('构建z对映:', Date.now() - t, 'ms')
    // t = Date.now()

    // console.log('二次改进循环耗时:', Date.now() - t)
    // st = 0
    // console.log(linkMapZ)
    // Object.keys(linkMapZ).forEach(leftIdx=>{st+=linkMapZ[leftIdx].length})
    // console.log('此时筛选的循环次数: ', st)

    // 循环: 每一层z制造出差值距离, 再取最小差值minSubDist, 大于0有空隙,要靠近, 小于0有重叠,要远离
    // 首次循环计算minSubDist
    let { moveXDirection, minSubDist } = calculateMinDistByLinkMapData(
        initX,
        toothData,
        coEfficients,
        indexToZValue,
        linkMapZ,
        tolerance
    );
    // console.log('初始差距:', minSubDist<0 ? '重叠' + (-minSubDist) : '间隔' + minSubDist)
    // console.log('循环:', Date.now() - t, 'ms')
    // t = Date.now()
    // 开始循环, 直到minSubDist小于breakCondition
    while (Math.abs(minSubDist) > breakCondition) {
        // * 当 minSubDist > 0, 有空隙, 靠近, xR-minSubDist || xL+minSubDist || xR-minSubDist/2, xL+minSubDist/2
        // * 当 minSubDist < 0, 有重叠, 远离, xR-minSubDist || xL+minSubDist || xR-minSubDist/2, xL+minSubDist/2

        // 根据minSubDist沿moveXDirection方向进行移动, 此处为x坐标加减
        // 需事先计算出沿moveXDirection的minSubDist的移动对应于在x坐标上应该加减多少距离
        let moveXdist = minSubDist * moveXDirection[0]; // 相当于minSubDist在正坐标系x轴上的投影
        if (isLeftRemovable && isRightRemovable) {
            // 左右皆移动, 两边各移动一半的minSubDist
            // 修改x坐标并转换对应数据
            initX.left += moveXdist / 2;
            initX.right -= moveXdist / 2;
            transformSingleDataAlongArch(
                toothData.left,
                initX.left,
                coEfficients,
                zLevelOfArch,
                zDirection
            );
            transformSingleDataAlongArch(
                toothData.right,
                initX.right,
                coEfficients,
                zLevelOfArch,
                zDirection
            );
            // 更新投影距离
        } else if (isLeftRemovable) {
            // 仅左可动
            // 修改x坐标并转换对应数据
            initX.left += moveXdist;
            transformSingleDataAlongArch(
                toothData.left,
                initX.left,
                coEfficients,
                zLevelOfArch,
                zDirection
            );
        } else {
            // 仅右可动
            // 修改x坐标并转换对应数据
            initX.right -= moveXdist;
            transformSingleDataAlongArch(
                toothData.right,
                initX.right,
                coEfficients,
                zLevelOfArch,
                zDirection
            );
        }
        // 移动并转换完成后继续循环
        let ret = calculateMinDistByLinkMapData(
            initX,
            toothData,
            coEfficients,
            indexToZValue,
            linkMapZ,
            tolerance
        );
        moveXDirection = ret.moveXDirection;
        // t = Date.now()
        if (Math.abs(minSubDist) < Math.abs(ret.minSubDist)) {
            // console.log('反弹break')
            // 如果发现本次计算的移动距离反而开始增大, 则不应继续循环, 保持住当前的minDist并跳出, 此时应该基本贴合
            // 此时可以根据最近点继续更新, 即计算所有leftPoint与对应rightPoint中最近点的x投影距离之差进行移动
            break;
        }
        // 如果继续收敛, 则更新minSubDist并继续循环
        minSubDist = ret.minSubDist;
    }
    // 出去时 Math.abs(minSubDist) <= breakCondition
    // 此时对应的数据也转换到了最佳的位置上, 返回两个变换后的x点
    return { finalXL: initX.left, finalXR: initX.right };
}
function calculateMinDistByLinkMapData(
    initX,
    toothData,
    coEfficients,
    indexToZValue,
    linkMapZ,
    tolerance
) {
    // 移动方向(与投影方向)定义为两个点之间的连线方向
    let moveXDirection = [
        initX.right - initX.left,
        calculateArchY(initX.right, coEfficients) -
            calculateArchY(initX.left, coEfficients),
    ];
    normalize2D(moveXDirection);
    // 垂直投影方向
    let moveYDirection = [-moveXDirection[1], moveXDirection[0]];

    // 为了避免重复计算, 事先计算所有涉及到的左右点投影坐标
    const projOfLoc = {};
    for (let toothLoc of ["left", "right"]) {
        projOfLoc[toothLoc] = {};
        indexToZValue[toothLoc].forEach((item) => {
            const { index } = item;
            const points = [
                toothData[toothLoc].toothPointsData[index],
                toothData[toothLoc].toothPointsData[index + 1],
            ];
            projOfLoc[toothLoc][index] = [
                projectToAxis2D(moveXDirection, [points[0], points[1]]),
                projectToAxis2D(moveYDirection, [points[0], points[1]]),
            ];
        });
    }

    // const projOfLeft = {}
    // const projOfRight = {}
    // indexToZValue.left.forEach(item=>{
    //     const {index} = item
    //     const leftPoints = [
    //         toothData.left.toothPointsData[index],
    //         toothData.left.toothPointsData[index + 1],
    //     ]
    //     projOfLeft[index] = [
    //         projectToAxis2D(moveXDirection, [leftPoints[0], leftPoints[1]]),
    //         projectToAxis2D(moveYDirection, [leftPoints[0], leftPoints[1]]),
    //     ]
    // })
    // indexToZValue.right.forEach(item=>{
    //     const {index} = item
    //     const rightPoints = [
    //         toothData.right.toothPointsData[index],
    //         toothData.right.toothPointsData[index + 1],
    //     ]
    //     projOfRight[index] = [
    //         projectToAxis2D(moveXDirection, [rightPoints[0], rightPoints[1]]),
    //         projectToAxis2D(moveYDirection, [rightPoints[0], rightPoints[1]]),
    //     ]
    // })
    let minSubDist = Infinity;
    Object.keys(linkMapZ).forEach((leftIdx) => {
        const projCoordOfLeft = projOfLoc.left[leftIdx];
        // 根据value遍历右边点
        linkMapZ[leftIdx].forEach((rightIdx) => {
            const projCoordOfRight = projOfLoc.right[rightIdx];
            // 如果二者y相同(容差以内算作相同), 则计算x之差(right-left)
            if (
                Math.abs(projCoordOfRight[1] - projCoordOfLeft[1]) < tolerance
            ) {
                minSubDist = Math.min(
                    projCoordOfRight[0] - projCoordOfLeft[0],
                    minSubDist
                );
            }
        });
    });
    return { moveXDirection, minSubDist };
}
/**
 * @description 计算点x在normal方向上的投影坐标
 * @param normal 某一方向单位法向量, 已知输入模值为1(否则需要除)
 * @param x 点
 */
function projectToAxis2D(normal, x) {
    return normal[0] * x[0] + normal[1] * x[1];
}
/**
 * @description 计算牙弓线上的某一点x0对应的y0坐标
 * y=f(x)=a0+a1x+a2x^2+a3x^3+a4x^4
 * @param x x0坐标
 * @param coEfficients [[a0],[a1],[a2],[a3],[a4]]
 */
function calculateArchY(x, coEfficients) {
    return (
        coEfficients[0][0] +
        coEfficients[1][0] * x +
        coEfficients[2][0] * x ** 2 +
        coEfficients[3][0] * x ** 3 +
        coEfficients[4][0] * x ** 4
    );
}
/**
 * @description 计算在牙弓线x坐标处所对应的3个法向量, 其中的对应关系为
 * 切线方向(左右) - 托槽xNormal
 * zNormal(上下) - 托槽yNormal(非计算得到, 新坐标系固有指向)
 * 径向方向(前后) - 托槽zNormal
 *
 * 当前正坐标系:
 * +x: 上颌牙L->R, 下颌牙L->R
 * +y: 上颌牙指向牙齿外侧, 下颌牙指向牙齿外侧
 * +z: 上颌牙指向牙尖(-1),下颌牙指向牙尖(1)
 *
 * 切线方向指向+x, 径向方向都有可能
 *
 * @param x x坐标
 * @param coEfficients 决定牙弓线的系数
 * @param zLevelOfArch 用于z坐标的读取
 * @param zDirection 上颌牙为-1, 下颌牙为1
 * @return 返回目标matrix, 对应 源matrix 格式[center+xNormal, center+yNormal, center+zNormal, center]
 */
function calculateTransMatrixOnArch(
    x,
    coEfficients,
    zLevelOfArch,
    zDirection = 1
) {
    // position - 托槽center
    const position = [x, calculateArchY(x, coEfficients), zLevelOfArch];
    // 切向 - 左右 - 托槽xNormal
    const tangentialNormal = [1, calculateArchDerivate(x, coEfficients), 0];
    normalize(tangentialNormal);
    // 托槽xNormal: 上颌牙指向左侧(+x)/下颌牙指向右侧(-x)
    if (zDirection === 1) {
        multiplyScalar(tangentialNormal, -1);
    }
    // zNormal(0,0,1/-1) - 托槽yNormal(指向牙尖)
    const zNormal = [0, 0, zDirection];
    // 径向 - 牙齿内外侧 - 托槽zNormal
    const radicalNormal = [0, 0, 0];
    cross(
        tangentialNormal, // 利用导数计算该点切线方向
        zNormal, // z轴方向经过转换后
        radicalNormal
    );
    normalize(radicalNormal);
    // 径向指向外侧, 即+y成锐角
    if (
        degreesFromRadians(angleBetweenVectors(radicalNormal, [0, 1, 0])) > 90
    ) {
        multiplyScalar(radicalNormal, -1);
    }
    // console.log('径向与+x角度', zDirection === -1? '上颌牙':'下颌牙', degreesFromRadians(angleBetweenVectors(radicalNormal, [0, 1, 0])))
    return [
        position[0] + tangentialNormal[0],
        position[1] + tangentialNormal[1],
        position[2] + tangentialNormal[2],
        position[0] + zNormal[0],
        position[1] + zNormal[1],
        position[2] + zNormal[2],
        position[0] + radicalNormal[0],
        position[1] + radicalNormal[1],
        position[2] + radicalNormal[2],
        position[0],
        position[1],
        position[2],
    ];
}
/**
 * @description 对单个牙齿应用指定变换
 * @param transSegSingleData 待转换的单个牙齿数据(牙齿点+托槽点+长轴3点+托槽3Normal+托槽中心)
 * @param matrix 转换矩阵
 * @param transName 指定转换哪些数据
 */
function transformSingleToothData(
    transSegSingleData,
    matrix,
    transName = ["tooth", "bracket", "longAxis", "bracketMatrix"]
) {
    const {
        toothPointsData,
        bracketPointsData,
        longAxis,
        bracketMatrix,
    } = transSegSingleData;
    const matTransformer = vtkMatrixBuilder.buildFromDegree().setMatrix(matrix);
    // 牙齿
    if (transName.includes("tooth")) {
        matTransformer.apply(toothPointsData);
    }
    // 长轴
    if (transName.includes("longAxis")) {
        Object.keys(longAxis).forEach((pointType) => {
            matTransformer.apply(longAxis[pointType]);
        });
    }
    // 托槽
    if (transName.includes("bracket")) {
        matTransformer.apply(bracketPointsData);
    }
    // 托槽法向量
    if (transName.includes("bracketMatrix")) {
        Object.keys(bracketMatrix).forEach((pointType) => {
            if (pointType === "center") {
                matTransformer.apply(bracketMatrix[pointType]);
            } else {
                bracketMatrix[pointType] = getTransformNormal(
                    bracketMatrix[pointType],
                    matrix
                );
            }
        });
    }
}
/**
 * @description 根据center, xNormal, yNormal, zNormal计算刚体配准变换矩阵
 * @param originalAxis 原始坐标系
 * @param targetAxis 目标坐标系
 */
function calculateRigidBodyTransMatrix(originalAxis, targetAxis, originCenter=[0,0,0]) {
    originalAxis[0] = originalAxis[0]+originCenter[0]
    originalAxis[1] = originalAxis[1]+originCenter[1]
    originalAxis[2] = originalAxis[2]+originCenter[2]
    originalAxis[3] = originalAxis[3]+originCenter[0]
    originalAxis[4] = originalAxis[4]+originCenter[1]
    originalAxis[5] = originalAxis[5]+originCenter[2]
    originalAxis[6] = originalAxis[6]+originCenter[0]
    originalAxis[7] = originalAxis[7]+originCenter[1]
    originalAxis[8] = originalAxis[8]+originCenter[2]
    let originPoints = vtkPoints.newInstance(); // 原始点集
    originPoints.setData(originalAxis);
    let targetPoints = vtkPoints.newInstance(); // 目标点集
    // 注：3个法向量都是单位法向量,模值为1
    targetPoints.setData(targetAxis);
    // 根据点集计算转换矩阵
    const transform = vtkLandmarkTransform.newInstance();

    transform.setMode(0); // 刚体配准(只允许平移+旋转)
    transform.setSourceLandmark(originPoints); // vtkPoints:3D源点集列表
    transform.setTargetLandmark(targetPoints); // vtkPoints:3D目标点集列表
    transform.update(); // 根据目标点集和源点集启动矩阵计算

    return transform.getMatrix(); // mat4矩阵,转换结果(4*4)(平移加旋转)
}
/**
 * @description 计算牙弓线上的某一点x0对应的导数f'(x0) = dy/dx
 * f(x)=a0+a1x+a2x^2+a3x^3+a4x^4
 * f'(x)=a1+a2*2x+a3*3x^2+a4*4x^3
 * @param x x0坐标
 * @param coEfficients [[a0],[a1],[a2],[a3],[a4]]
 */
function calculateArchDerivate(x, coEfficients) {
    return (
        coEfficients[1][0] +
        coEfficients[2][0] * 2 * x +
        coEfficients[3][0] * 3 * x ** 2 +
        coEfficients[4][0] * 4 * x ** 3
    );
}
/**
 * @description 获得某个坐标点经刚体变换后的坐标
 * @param pointCoord 法向量, eg.[0,0,1]
 * @param matrix 转换矩阵
 */
function getTransformNormal(pointCoord, matrix) {
    let normalPoints = [0, 0, 0, pointCoord[0], pointCoord[1], pointCoord[2]];
    vtkMatrixBuilder
        .buildFromDegree()
        .setMatrix(matrix)
        .apply(normalPoints);
    return [
        normalPoints[3] - normalPoints[0],
        normalPoints[4] - normalPoints[1],
        normalPoints[5] - normalPoints[2],
    ];
}

/**
 * @description 计算牙齿点集在指定投影方向上的宽度
 * @param direction 方向向量
 * @param points 点集
 */
function calculateProjectWidthOfTooth(direction, points) {
    const numOfPoints = points.length / 3;
    const bound = [Infinity, -Infinity]; // min, max
    for (let i = 0; i < numOfPoints; i++) {
        const pointOffset = i * 3;
        const point = [
            points[pointOffset],
            points[pointOffset + 1],
            points[pointOffset + 2],
        ];
        const projectVal = projectToAxis(direction, point);
        bound[0] = Math.min(projectVal, bound[0]);
        bound[1] = Math.max(projectVal, bound[1]);
    }
    return bound[1] - bound[0];
}
/**
 * @description 计算点x在normal方向上的投影坐标
 * @param normal 某一方向单位法向量, 模值为1
 * @param x 其它点
 */
function projectToAxis(normal, x) {
    const num = normal[0] * x[0] + normal[1] * x[1] + normal[2] * x[2]; // |normal|*|x|*cosa
    const norm = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2); // |normal|
    return num / norm; // |x|*cosa(返回的相当于是从(0,0,0)点开始想normal延伸的一个坐标轴上, x点的投影坐标)
}

/**
 * @description 根据xNormal, yNormal, zNormal构造牙齿坐标系矩阵
 */
 function generateTeethAxisByNormal(center, xNormal, yNormal, zNormal) {
    return [
        center[0] + xNormal[0],
        center[1] + xNormal[1],
        center[2] + xNormal[2],
        center[0] + yNormal[0],
        center[1] + yNormal[1],
        center[2] + yNormal[2],
        center[0] + zNormal[0],
        center[1] + zNormal[1],
        center[2] + zNormal[2],
        center[0],
        center[1],
        center[2],
    ];
}

export {
    moveToothDataAlongArchByImpactTest,
    calculateProjectWidthOfTooth,
    calculateRigidBodyTransMatrix,
    projectToAxis,
    transformSingleToothData,
    calculateArchY,
    calculateArchDerivate,
    findMatchPair,
    generateTeethAxisByNormal,
};
