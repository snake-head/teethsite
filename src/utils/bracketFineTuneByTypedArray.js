import vtkPoints from "@kitware/vtk.js/Common/Core/Points";
import vtkLandmarkTransform from "@kitware/vtk.js/Common/Transform/LandmarkTransform";
import {
    dot2D,
    areEquals,
    solveLeastSquares,
    normalize,
    cross,
    degreesFromRadians,
    angleBetweenVectors,
    multiplyScalar,
    subtract,
    add,
} from "../reDesignVtk/Math";
import vtkMatrixBuilder from "@kitware/vtk.js/Common/Core/MatrixBuilder";
import Constants from "@kitware/vtk.js/Common/Transform/LandmarkTransform/Constants";
const { Mode } = Constants;

/**
 * 对于vtk读进来的所有模型,它们读进去的vtkPoints其实都是以(0, 0, 0)为中心的, 我们通过后续的一些设置,比如对点集的一些旋转
 * 将它们以某个固定角度放置在某个固定的坐标上
 * 如 vtkMatrixBuilder 中对点集的平移和旋转
 * 如果平移后,每个点集就会偏离(0,0,0)的中心,
 * 那么此时再进行旋转的后果是什么,旋转是以(0,0,0)点设置一个轴,那么点集最后的旋转肯定是绕着圆心出发的一条射线旋转的
 * 一个点(1,0,0), 先经过平移到(2,0,0), 再绕(0,0,1)旋转90度, 肯定是(0,2,0), 对于物体就是后续的旋转会有一个自身旋转 + 过度平移的效果
 * vtkMatrixBuilder分开应用上述
 *  vtkMatrixBuilder
     .buildFromDegree()
     .translate(1,0,0)
     .apply(a)
    vtkMatrixBuilder
     .buildFromDegree()
     .rotate(90, [0,0,1])
     .apply(a)
 * 就是(1,0,0)->(0,2,0)
 * 但是如果合起来对源点集连续应用
    vtkMatrixBuilder
     .buildFromDegree()
     .translate(1,0,0)
     .rotate(90, [0,0,1])
     .apply(b)
 * 就是(1,0,0)->(1,1,0)(自身旋转至(0,1,0)+平移(1,0,0))
 * 这是由于vtkMatrixBuilder一直在对里面内置的一个4x4变换矩阵操作,只有apply的时候才会把变换矩阵乘到点集上改变点集
 * 在对托槽点集进行微调时需要注意,它首先读进去是以(0,0,0)点为中心的,它的旋转肯定是绕自己的中心旋转的
 */

/**
 * @description 计算P点是否在三角形ABC内部(边界点也算内部)(投影到XOY平面上, 二维, 与z无关, 在边界内则三维也在边界内)
 * 设AP = uAB+vAC, 则当 0<=v<=1 && 0<=u<=1 && u+v<=1时 P在ABC内部,
 *
 * 等式两边分别点乘AB和AC得到两个等式
 * AP▪AB = (uAB+vAC)▪AB
 * AP▪AC = (uAB+vAC)▪AC
 * 展开得
 * AP▪AB = uAB▪AB+vAC▪AB
 * AP▪AC = uAB▪AC+vAC▪AC
 * 由于 AB▪AC=AC▪AB 得到
 * AP▪AB = uAB▪AB+vAB▪AC
 * AP▪AC = uAB▪AC+vAC▪AC
 * 计算5次点乘后可得到结果
 * d0 = u*d1+v*d2
 * d3 = u*d2+v*d4
 * 解得
 * u = (d0*d4-d2*d3)/(d1*d4-d2*d2)
 * v = (d1*d3-d0*d2)/(d1*d4-d2*d2)
 *
 * 注：向量乘法交换率 a▪b=b▪a
 * (xa,ya)▪(xb,yb) = (xb,yb)▪(xa,ya) = (xa*xb, ya*yb)
 * 注：向量乘法分配率 a▪(b+c) = a▪b+a▪c
 * (xa,ya)▪(xb+xc,yb+yc) = (xa,ya)▪(xb,yb)+(xa,ya)▪(xc,yc) = (xa*xb+xa*xc,ya*yb+ya*yc)
 * 注：AP = uAB+vAC成立需要满足一个条件, 即ABC有面积/不共线, 由于ABC是一个具体面片在xOy平面上的投影,
 *  因此投影成一条直线是有可能的, 这种情况要直接返回false
 * @param pointA (xA, yA)
 * @param pointB (xB, yB)
 * @param pointC (xC, yC)
 * @param pointP (xP, yP)
 */
function isInTriangle(pointA, pointB, pointC, pointP) {
    let AB = [pointB[0] - pointA[0], pointB[1] - pointA[1]];
    let AC = [pointC[0] - pointA[0], pointC[1] - pointA[1]];
    let AP = [pointP[0] - pointA[0], pointP[1] - pointA[1]];
    // 若ABC点共线则不满足前提假设条件, 返回false
    // let eps = Number.MIN_VALUE
    // if (pointA[1] - pointB[1] < eps && pointA[1] - pointC[1] < eps // ABC的y坐标相等, 此时算斜率为NaN
    //     ||
    //     Math.abs(AB[1]/AB[0]) - Math.abs(AC[1]/AC[0]) < eps // AB = uAC
    //     ) {
    //     return false
    // }
    if (
        (pointA[1] === pointB[1] && pointA[1] === pointC[1]) || // ABC的y坐标相等, 此时算斜率为NaN
        Math.abs(AB[1] / AB[0]) === Math.abs(AC[1] / AC[0]) // AB = uAC
    ) {
        return false;
    }
    let d0 = dot2D(AP, AB);
    let d1 = dot2D(AB, AB);
    let d2 = dot2D(AB, AC);
    let d3 = dot2D(AP, AC);
    let d4 = dot2D(AC, AC);

    let inverDeno = 1 / (d1 * d4 - d2 * d2);
    if (Number.isNaN(inverDeno)) {
        return false;
    }
    let u = (d0 * d4 - d2 * d3) * inverDeno;
    if (u < 0 || u > 1 || Number.isNaN(u)) {
        // u不满足时直接返回
        return false;
    }
    let v = (d1 * d3 - d0 * d2) * inverDeno;
    if (v < 0 || v > 1 || Number.isNaN(v)) {
        // v不满足时直接返回
        return false;
    }
    if (u + v >= 1) {
        return false;
    } else {
        return { u, v };
    }
}

/**
 * @description 计算某一点沿某一方向延伸直线与一三角形有界平面的交点之间的距离(沿第三轴)
 * 问题：设A、B、C、P为三维平面内4点,且P点在ABC三角形内部, 已知A、B、C、P在xOy平面上的投影点分别为A’, B‘, C‘, P’,
 * 且投影点满足 A'P' = u*A'B' + v*A'C', 求证：是否有 AP = u*AB + v*AC ?
 * 证： 已知P点在ABC三角形内部, 则必定存在u0和v0使得 AP = u0*AB + v0*AC
 * 即 xP-xA = u0*(xB-xA) + v0*(xC-xA)
 * 由上述知投影点 A'P' = u*A'B' + v*A'C', 则 xP-xA = u*(xB-xA) + v*(xC-xA)
 * 易知 u0=u, v0=v
 * 即有 AP = u*AB + v*AC
 * 通过上述函数计算返回值能够直接用于计算外面一点P沿某方向向ABC平面的交点
 * 如果不在平面内则返回正无穷
 * @param pointA 点A在xNormal,yNormal,zNormal上的投影坐标
 * @param pointB 点B在xNormal,yNormal,zNormal上的投影坐标
 * @param pointC 点C在xNormal,yNormal,zNormal上的投影坐标
 * @param pointP 点P在xNormal,yNormal,zNormal上的投影坐标
 * @return 返回距离,如果该点在三角形上没有投影则返回正无穷Infinity
 */
function pointDistanceWithPlaneAlongAxis(pointA, pointB, pointC, pointP) {
    // isInTriangle函数中接收三维坐标但只会用到前两维, 不会动zNormal投影坐标
    let ret = isInTriangle(pointA, pointB, pointC, pointP);
    if (ret === false) {
        // 如果不在平面内,则返回正无穷
        return Infinity;
    } else {
        const { u, v } = ret;

        // let AB = [
        //     pointB[0] - pointA[0],
        //     pointB[1] - pointA[1],
        //     pointB[2] - pointA[2],
        // ]
        // let AC = [
        //     pointC[0] - pointA[0],
        //     pointC[1] - pointA[1],
        //     pointC[2] - pointA[2],
        // ]
        // const AP = [
        //     u*AB[0] + v*AC[0],
        //     u*AB[1] + v*AC[1],
        //     u*AB[2] + v*AC[2],
        // ]
        // const crossPoint = [
        //     pointA[0] + AP[0],
        //     pointA[1] + AP[1],
        //     pointA[2] + AP[2]
        // ]

        // 注 此时的crossPoint应该x和y是和p对上的, 只要计算z就够了
        const zCrossPoint =
            pointA[2] +
            u * (pointB[2] - pointA[2]) +
            v * (pointC[2] - pointA[2]); // P = A + AP = A + (u*AB + v*AC)
        return zCrossPoint - pointP[2];
    }
}

/**
 * @description 3D, 沿轴方向为第三个维度
 * @param {*} pointA 3D
 * @param {*} pointB 3D
 * @param {*} pointC 3D
 * @param {*} pointP 2D及以上
 * @returns
 */
function getCrossPointWithPlaneAlongAxis(pointA, pointB, pointC, pointP) {
    // isInTriangle函数中接收三维坐标但只会用到前两维, 不会动zNormal投影坐标
    let ret = isInTriangle(pointA, pointB, pointC, pointP);
    if (ret === false) {
        // 如果不在平面内,则返回正无穷
        return undefined;
    } else {
        const { u, v } = ret;
        // 注 此时的crossPoint应该x和y是和p对上的, 只要计算z就够了
        const zCrossPoint =
            pointA[2] +
            u * (pointB[2] - pointA[2]) +
            v * (pointC[2] - pointA[2]); // P = A + AP = A + (u*AB + v*AC)
        return zCrossPoint;
    }
}

/**
 * @description 计算p1, p2组成的无限延伸直线与x之间的距离
 * @param p1 直线上一点
 * @param p2 直线上另一点
 * @param x 其它点
 */
function distanceToLine(p1, p2, x) {
    const p21 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]]; // p1->p2的直线方程
    const xp1 = [x[0] - p1[0], x[1] - p1[1], x[2] - p1[2]]; // p1->x的直线方程
    const num = p21[0] * xp1[0] + p21[1] * xp1[1] + p21[2] * xp1[2]; // |p21|*|xp1|*cosa
    const denom = p21[0] ** 2 + p21[1] ** 2 + p21[2] ** 2; // |p21|^2
    const t = num / denom; // |xp1|/|p21| * cosa
    // 注意此处的|xp1| * cosa所代表的直观含义为xp1在p21上的投影距离
    // 再除以|p21|即为 x投影占p21的总距离

    // 计算直线上距离x的最近点,即x向直线作垂线所相交的点o, 上述t=|p1o|/|p21|
    let closest = [p1[0] + t * p21[0], p1[1] + t * p21[1], p1[2] + t * p21[2]]; // 从p1点出发前进t个比例的p21距离

    //返回距离
    return Math.sqrt(
        (x[0] - closest[0]) ** 2 +
            (x[1] - closest[1]) ** 2 +
            (x[2] - closest[2]) ** 2
    );
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
 * @description 判断两个范围是否重合, 只要看它们最小值中更大的值和最大值中更小的值是否有范围
 * @param range1: [min, max]
 * @param range2: [min, max]
 * @return {boolean}
 */
function isRangeOverlapping(range1, range2) {
    // overlap:
    // [    ]
    //    [   ]
    return Math.max(range1[0], range2[0]) <= Math.min(range1[1], range2[1]);
}

/**
 * @description 判断两个面片是否相邻 <=> 一边重合 <=> 两顶点重合 -> 顺序不重要
 * @param face1: {point1, point2, point3}
 * @param face2: {point1, point2, point3}
 * @param {Number} thresh
 * @return {boolean}
 */
function isFaceNeighbor(face1, face2, thresh = 1) {
    const { point1: f1p1, point2: f1p2, point3: f1p3 } = face1;
    const { point1: f2p1, point2: f2p2, point3: f2p3 } = face2;
    let cnt = 0;
    for (let pointOfFace1 of [f1p1, f1p2, f1p3]) {
        for (let pointOfFace2 of [f2p1, f2p2, f2p3]) {
            // cnt += isSame3DPoint(pointOfFace1, pointOfFace2)
            cnt += areEquals(pointOfFace1, pointOfFace2);
        }
    }
    return cnt >= thresh;
}

/**
 * @description 根据所给面片种子点向外扩张
 * @param faceSet 面片集, 此时应该用角度筛选过
 * @param minSeed 面片数量取一定百分比作为种子点, 从zMin最小开始取(zMin最小的就是在底面上的)
 */
function bracketBottomFaceExpand(faceSet, minSeed = 0.01) {
    let originalFaceSet = [...faceSet];
    let expandFaceSet = [];
    // 按zMin排序, 由小到大
    originalFaceSet.sort((a, b) => a.zMin - b.zMin);
    // 种子点从zMin最小开始填充至minSeed
    while (expandFaceSet.length < originalFaceSet.length * minSeed) {
        expandFaceSet.push(originalFaceSet.splice(0, 1)[0]);
    }
    // 每一次循环, 我们都会对新增的外面一圈面片去寻找相邻面片进行扩张
    let queryNeighborFaceSetForThisLoop = [...expandFaceSet];
    // 直到不能膨胀为止
    while (queryNeighborFaceSetForThisLoop.length > 0) {
        let newNeighborFaceSet = []; // 记录当前循环找到的外圈面片
        for (let queryFace of queryNeighborFaceSetForThisLoop) {
            let expandIdxOfThisLoop = []; // 记录这个种子点面片的相邻面片索引号
            for (let j = 0; j < originalFaceSet.length; j++) {
                if (
                    isRangeOverlapping(
                        [queryFace.zMin, queryFace.zMax],
                        [originalFaceSet[j].zMin, originalFaceSet[j].zMax]
                    )
                ) {
                    // 两个相邻面片一定在zRange上有重合(边有重合)
                    // 如果两个面片有两个点相同则是相邻面片(此处设置一个点相同即作为相邻面片)
                    if (isFaceNeighbor(queryFace, originalFaceSet[j])) {
                        expandIdxOfThisLoop.push(j);
                    }
                } else if (queryFace.zMax < originalFaceSet[j].zMin) {
                    // 后面的z更大, 不用往后看了
                    break;
                }
            }
            expandIdxOfThisLoop.sort((a, b) => b - a); // 后->前
            // 扩充+删除(后序号向前序号删, 不会出意外)
            for (let idx of expandIdxOfThisLoop) {
                newNeighborFaceSet.push(originalFaceSet.splice(idx, 1)[0]);
            }
        }
        newNeighborFaceSet.sort((a, b) => a.zMin - b.zMin); // zMin由小到大
        // 往expandFaceSet中添加
        for (let face of newNeighborFaceSet) {
            expandFaceSet.push(face);
        }
        // 下一次循环以本次找到的外圈相邻面片作为种子点
        queryNeighborFaceSetForThisLoop = newNeighborFaceSet;
    }

    return expandFaceSet;
}

/**
 * @description 取在托槽底面上的一些点, 过这些拟合一个平面, 作为近似的托槽底面, 实际上要算的是这个平面的法向量
 * 这种做法基本等效于,
 * 算出的几个点, 在x-z平面上拟合一条y=k1x+b1
 * 在y-z平面上拟合一条y=k2x+b2, 则根据k1,k2就能做出一个平面，过R点, 用这个平面近似底面
 * 1、计算边界框
 * 2、根据边界框的xy边界划分在固定百分比处取点, 得到NxN个棋盘点, 用二维Array表示
 * 假设N=8,则它的百分比为[0,1/8,2/8,...,7/8]+1/16
 * 即百分比计算为[0,1/N,2/N,...,(N-1)/N]+1/2N
 * 3、遍历托槽面片, 计算所有固定点对应的托槽表面的投影点(有些投影点可能会投空, z值为Infinity), 同时记录该投影点所在面片
 * 假设, 或者说先验: 这N*N个点中, z值最小的点必定在托槽底面上
 * 4、计算这个棋盘上每个点到4邻点的斜率, 不要取绝对值
 * 一共会得到2N(N-1)个斜率, 这些斜率就是相邻棋盘点的z变化量
 * 假设: 棋盘点中会有超过半数落在托槽底面上, 底面点与点之间不孤立, 因此邻点间z变化量基本会恒定在一个范围
 * 但当遇到底面点和托槽头部点之间的跳变, 此时z变化量会脱离该范围, 成为离群值
 * 注意x轴斜率和y轴斜率分开计算, 不是因为量纲, 而是因为托槽形状
 * 注意一些托槽是马鞍形的, 此时x分布一个曲线, y分布一个直线, 分布差异较大, 宜分开计算
 * 5、根据箱型图法寻找斜率中的离群值, 设置为不可到达
 * 期望上述操作能把从托槽底面到托槽头部的路径全部去掉
 * 箱型图法: 取四分位数点(Q1-25%,Q2-50%,Q3-75%, 其中Q2即为中位数),
 * 设置边界为 Q1 - 1.5 * (Q3 - Q1)~ Q3 + 1.5 * (Q3 - Q1)
 * 超出该边界的点设置为离群值
 * 6、剩余路径, 以起始点为z值最小的棋盘点(假设必定在底面)开始膨胀, 直至膨胀完全
 * 该点集即作为托槽底面均匀网格采样点
 * 7、这些筛选棋盘点, 取最外圈一圈轮廓对应的点作为托槽底面40点
 * 8、根据这些筛选棋盘点, 近似拟合一个平面, 求取该平面法向量, 作为近似托槽底面的法向量
 * 9、根据该估计法向量转换整个托槽数据, 使托槽底面要近似垂直z轴, 即要从近似法向量(歪)转到z轴(正)
 * 10、根据3中记录的投影点所在面片(必定是底面面片), 根据转正托槽点坐标计算zMax, 之后要求托槽底面必须小于该zMax
 * 同时注意这些面片将作为第11步的初始膨胀点
 * 11、遍历面片, 根据转正托槽坐标筛选:
 * 条件1:面片法向量 和 z轴 夹角小于30°
 * 条件2:该面片所有顶点中z坐标至少有一点小于等于zMax
 * 在第3步中记录这些棋盘点所对应的面片, 作为初始膨胀点, 直至膨胀完全, 作为托槽底面面片
 * @param {Array} bracketPointValues
 * @param {Array} bracketFacesData
 * @param {Number} gridSize default: 10, 每个点都会算出一个沿z轴投影到托槽底面的点M
 * @param {Number} angleBound default: 30, 角度阈值, 用于筛选出垂直与z轴的托槽面片
 * 取得越多, 计算量越大, 拟合的平面越精确
 */
function estimateBracketBottomSlope(
    bracketPointValues,
    bracketFacesData,
    gridSize = 8,
    angleBound = 30
) {
    // -------------------------------------
    // 1. 计算边界框
    // -------------------------------------
    let sizeBracketPoints = bracketPointValues.length, // 托槽点集长度
        sizeBracketFaces = bracketFacesData.length; // 托槽面片集长度
    let xMin = Infinity,
        xMax = -Infinity,
        yMin = Infinity,
        yMax = -Infinity,
        zMin = Infinity,
        zMax = -Infinity,
        point;
    for (let idx = 0; idx < sizeBracketPoints; idx += 3) {
        point = [
            bracketPointValues[idx],
            bracketPointValues[idx + 1],
            bracketPointValues[idx + 2],
        ]; // [yProj, zProj, xProj]
        if (point[0] < yMin) {
            yMin = point[0];
        }
        if (point[0] > yMax) {
            yMax = point[0];
        }
        if (point[1] < zMin) {
            zMin = point[1];
        }
        if (point[1] > zMax) {
            zMax = point[1];
        }
        if (point[2] < xMin) {
            xMin = point[2];
        }
        if (point[2] > xMax) {
            xMax = point[2];
        }
    }
    // console.log(`托槽范围(${xMax - xMin} x ${yMax-yMin} x ${zMax-zMin}): [${xMin}~${xMax}, ${yMin}~${yMax}, ${zMin}~${zMax}]`)
    // -------------------------------------
    // 2. 根据边界框的xy边界划分在固定百分比处取点, 得到NxN个棋盘点, 用二维Array表示
    // -------------------------------------
    let gridCoordsProjOnBracket = new Array(gridSize), // 棋盘点坐标
        faceIndexsOfGridProj = new Array(gridSize), // 棋盘点投影点所在面片
        xRange = xMax - xMin,
        yRange = yMax - yMin,
        gridSizeX = xRange / gridSize,
        gridSizeY = yRange / gridSize;
    for (let i = 0; i < gridSize; i++) {
        gridCoordsProjOnBracket[i] = new Array(gridSize);
        faceIndexsOfGridProj[i] = new Array(gridSize);
        for (let j = 0; j < gridSize; j++) {
            // 假设N=8,则它的百分比为[0,1/8,2/8,...,7/8]+1/16
            // 即百分比计算为[0,1/N,2/N,...,(N-1)/N]+1/2N
            gridCoordsProjOnBracket[i][j] = [
                xMin + gridSizeX * (i + 0.5),
                yMin + gridSizeY * (j + 0.5),
                undefined,
            ];
        }
    }
    // console.log('筛选棋盘格xy坐标')
    // gridCoordsProjOnBracket.forEach(
    //     (row, i)=>console.log(i, row.map(item=>`[${item[0].toFixed(2).toString()},${item[1].toFixed(2).toString()}]`))
    // )
    // -------------------------------------
    // 3、遍历托槽面片, 计算所有固定点对应的托槽表面的投影点(有些投影点可能会投空, z值为Infinity), 同时记录该投影点所在面片
    // -------------------------------------
    let point1Idx, point2Idx, point3Idx, point1, point2, point3, crossZ;

    for (let idx = 0; idx < sizeBracketFaces; idx += 4) {
        // 根据面片索引取出对应3个顶点的索引
        point1Idx = bracketFacesData[idx + 1] * 3;
        point2Idx = bracketFacesData[idx + 2] * 3;
        point3Idx = bracketFacesData[idx + 3] * 3;
        // 从点集中读取对应顶点坐标
        point1 = [
            bracketPointValues[point1Idx + 2],
            bracketPointValues[point1Idx],
            bracketPointValues[point1Idx + 1],
        ];
        point2 = [
            bracketPointValues[point2Idx + 2],
            bracketPointValues[point2Idx],
            bracketPointValues[point2Idx + 1],
        ];
        point3 = [
            bracketPointValues[point3Idx + 2],
            bracketPointValues[point3Idx],
            bracketPointValues[point3Idx + 1],
        ];
        gridCoordsProjOnBracket.forEach((gridRowCoords, i) => {
            gridRowCoords.forEach((gridCoord, j) => {
                crossZ = getCrossPointWithPlaneAlongAxis(
                    point1,
                    point2,
                    point3,
                    gridCoord
                );
                if (crossZ !== undefined) {
                    if (
                        !gridCoordsProjOnBracket[i][j][2] ||
                        crossZ < gridCoordsProjOnBracket[i][j][2]
                    ) {
                        // 不断更新为更小z值的投影点并记录该投影点所在面片
                        gridCoordsProjOnBracket[i][j][2] = crossZ;
                        faceIndexsOfGridProj[i][j] = idx;
                    }
                }
            });
        });
    }
    // console.log('投影点z值')
    // gridCoordsProjOnBracket.forEach(
    //     (row, i)=>console.log(i, row.map(item=>item[2] ? item[2].toFixed(2).toString() : '-'))
    // )
    // -------------------------------------
    // 4、计算这个棋盘上每个点到4邻点的斜率, 不要取绝对值
    // -------------------------------------
    let dzOfCoords = new Array(gridSize),
        validDzList = [],
        upCoordZ,
        leftCoordZ,
        bottomCoordZ,
        rightCoordZ,
        centerCoordZ;
    for (let i = 0; i < gridSize; i++) {
        dzOfCoords[i] = new Array(gridSize);
        for (let j = 0; j < gridSize; j++) {
            /**
             *             i-1,j
             *              |
             *   i,j-1  —— i,j —— i,j+1
             *             |
             *           i+1,j
             */
            // gridCoordsProjOnBracket[i][j][2]可能直接为undefined
            dzOfCoords[i][j] = {
                up: undefined,
                left: undefined,
                right: undefined,
                bottom: undefined,
            };
            centerCoordZ = gridCoordsProjOnBracket[i][j][2];
            // undefined即为不可到达
            if (centerCoordZ !== undefined) {
                upCoordZ =
                    i > 0 ? gridCoordsProjOnBracket[i - 1][j][2] : undefined;
                bottomCoordZ =
                    i < gridSize - 1
                        ? gridCoordsProjOnBracket[i + 1][j][2]
                        : undefined;
                leftCoordZ =
                    j > 0 ? gridCoordsProjOnBracket[i][j - 1][2] : undefined;
                rightCoordZ =
                    j < gridSize - 1
                        ? gridCoordsProjOnBracket[i][j + 1][2]
                        : undefined;
                if (upCoordZ !== undefined) {
                    dzOfCoords[i][j].up = (upCoordZ - centerCoordZ) / gridSizeX;
                    // validDzList.push({position: [i,j], direction: 'up', value: dzOfCoords[i][j].up})
                }
                if (bottomCoordZ !== undefined) {
                    dzOfCoords[i][j].bottom =
                        (bottomCoordZ - centerCoordZ) / gridSizeX;
                    validDzList.push({
                        position: [i, j],
                        direction: "bottom",
                        value: dzOfCoords[i][j].bottom,
                    });
                }
                if (leftCoordZ !== undefined) {
                    dzOfCoords[i][j].left =
                        (leftCoordZ - centerCoordZ) / gridSizeY;
                    // validDzList.push({position: [i,j], direction: 'left', value: dzOfCoords[i][j].left})
                }
                if (rightCoordZ !== undefined) {
                    dzOfCoords[i][j].right =
                        (rightCoordZ - centerCoordZ) / gridSizeY;
                    validDzList.push({
                        position: [i, j],
                        direction: "right",
                        value: dzOfCoords[i][j].right,
                    });
                }
            }
        }
    }

    // // 二阶导, 每个点的right-left和bottom-up
    // let dDzOfCoords = new Array(gridSize),
    //     validDDzList = {
    //         xAxis: [], // up -> bottom
    //         yAxis: [], // left -> right
    //     }
    // for (let i = 0; i < gridSize; i++) {
    //     dDzOfCoords[i] = new Array(gridSize)
    //     for (let j = 0; j < gridSize; j++) {
    //         dDzOfCoords[i][j] = {
    //             upToBottom: undefined,
    //             leftToRight: undefined,
    //         }
    //         let {up:upDZ, left:leftDZ, right:rightDZ, bottom:bottomDZ} = dzOfCoords[i][j]
    //         if (upDZ !== undefined && bottomDZ !== undefined) {
    //             validDDzList.xAxis.push({position: [i,j], value: bottomDZ - upDZ})
    //         }
    //         if (leftDZ !== undefined && rightDZ !== undefined) {
    //             validDDzList.yAxis.push({position: [i,j], value: rightDZ - leftDZ})
    //         }
    //     }
    // }

    // let meanOfValidDDzList = {}
    // let stdOfValidDDzList = {}
    // let validDDZBound = {}
    // for (let axis of ['xAxis', 'yAxis']) {
    //     meanOfValidDDzList[axis] = validDDzList[axis].reduce((prevSum, currDDz)=>prevSum+currDDz.value, 0) / validDDzList[axis].length
    //     stdOfValidDDzList[axis] = Math.sqrt(
    //             validDDzList[axis].reduce((prevSum, currDDz)=>prevSum + (currDDz.value - meanOfValidDDzList[axis])**2, 0) / (validDDzList[axis].length - 1 + 1e-200)
    //         )
    //     validDDZBound[axis] = 2 * stdOfValidDDzList[axis] + 1e-3
    //     // 计算每个点偏离均值的距离
    //     validDDzList[axis].forEach((item)=>item.value = Math.abs(item.value - meanOfValidDDzList[axis]))
    //     // 从小到大排序
    //     validDDzList[axis].sort((a,b)=>a.value-b.value)
    //     console.log('阈值', axis, validDDZBound[axis], validDDzList[axis])
    //     for (let i = validDDzList[axis].length - 1; i >= 0; i--) {
    //         let {position, value} = validDDzList[axis][i]
    //         if (value > validDDZBound[axis]) {
    //             console.log('二阶导离群值点', axis, position)
    //         }
    //     }
    // }
    // -------------------------------------
    // 5、根据箱型图法寻找斜率中的离群值, 设置为不可到达
    // 期望上述操作能把从托槽底面到托槽头部的路径全部去掉
    // -------------------------------------
    let validDzAxisList = {
        xAxis: validDzList.filter((item) => item.direction === "bottom"),
        yAxis: validDzList.filter((item) => item.direction === "right"),
    };
    // 箱式图方法寻找离群值(异常值影响数据分布, 中位数更鲁棒)
    let QuartileDz = {},
        validDzBound = {};
    for (let axis of ["xAxis", "yAxis"]) {
        // 排序
        validDzAxisList[axis].sort((a, b) => a.value - b.value);
        // console.log('一阶导列表', validDzAxisList[axis])
        // 25%, 50%, 75%点
        QuartileDz[axis] = {
            Q1:
                validDzAxisList[axis][
                    Math.round(validDzAxisList[axis].length * 0.25)
                ].value,
            Q2:
                validDzAxisList[axis][
                    Math.round(validDzAxisList[axis].length * 0.5)
                ].value,
            Q3:
                validDzAxisList[axis][
                    Math.round(validDzAxisList[axis].length * 0.75)
                ].value,
        };
        // console.log('四分位数', QuartileDz[axis])
        // 边界范围
        validDzBound[axis] = {
            max:
                QuartileDz[axis].Q3 +
                1.5 * (QuartileDz[axis].Q3 - QuartileDz[axis].Q1),
            min:
                QuartileDz[axis].Q1 -
                1.5 * (QuartileDz[axis].Q3 - QuartileDz[axis].Q1),
        };
        // console.log(`边界: ${validDzBound[axis].min}~${validDzBound[axis].max}`)
        // 筛选
        for (let i = validDzAxisList[axis].length - 1; i >= 0; i--) {
            let { position, value } = validDzAxisList[axis][i];
            if (
                value > validDzBound[axis].max ||
                value < validDzBound[axis].min
            ) {
                // console.log('一阶导离群值点', axis, position)
                if (axis === "xAxis") {
                    dzOfCoords[position[0]][position[1]].bottom = undefined;
                    dzOfCoords[position[0] + 1][position[1]].up = undefined;
                }
                if (axis === "yAxis") {
                    dzOfCoords[position[0]][position[1]].right = undefined;
                    dzOfCoords[position[0]][position[1] + 1].left = undefined;
                }
            }
        }
    }

    // // 3sigma准则寻找离群值
    // let meanOfValidDzList = {}
    // let stdOfValidDzList = {}
    // let validDZBound = {}
    // for (let axis of ['xAxis', 'yAxis']) {
    //     meanOfValidDzList[axis] = validDzAxisList[axis].reduce((prevSum, currDz)=>prevSum+currDz.value, 0) / validDzAxisList[axis].length
    //     stdOfValidDzList[axis] = Math.sqrt(
    //         validDzAxisList[axis].reduce((prevSum, currDz)=>prevSum + (currDz.value - meanOfValidDzList[axis])**2, 0) / (validDzAxisList[axis].length - 1 + 1e-200)
    //         )
    //     // validDZBound[axis] = 2 * stdOfValidDzList[axis] + 1e-3
    //     validDZBound[axis] = stdOfValidDzList[axis] + 1e-3
    //     // 计算每个点偏离均值的距离
    //     validDzAxisList[axis].forEach((item)=>item.value = Math.abs(item.value - meanOfValidDzList[axis]))
    //     // 从小到大排序
    //     validDzAxisList[axis].sort((a,b)=>a.value-b.value)
    //     console.log('阈值', validDZBound[axis], validDzAxisList[axis])
    //     for (let i = validDzAxisList[axis].length - 1; i >= 0; i--) {
    //         let {position, value} = validDzAxisList[axis][i]
    //         if (value > validDZBound[axis]) {
    //             console.log('一阶导离群值点', axis, position)
    //             if (axis === 'xAxis') {
    //                 dzOfCoords[position[0]][position[1]].bottom = undefined
    //                 dzOfCoords[position[0] + 1][position[1]].up = undefined
    //             }
    //             if (axis === 'yAxis') {
    //                 dzOfCoords[position[0]][position[1]].right = undefined
    //                 dzOfCoords[position[0]][position[1] + 1].left = undefined
    //             }
    //         }
    //     }
    // }

    // for (let i = validDzList.length - 1; i >= 0; i--) {
    //     let {position, direction, value} = validDzList[i]
    //     // if (protectGridSet[position[0]][position[1]] === 1) {
    //     //     // 受保护点不可删
    //     //     // console.log(`保护连接点: [${position[0]}, ${position[1]}]`)
    //     //     continue
    //     // }
    //     if (value > validBound) {
    //         console.log('一阶导离群值点', position)
    //         // 一个无向图, 要去掉两个对应的有向路径
    //         if (direction === 'bottom') {
    //             // if (protectGridSet[position[0]][position[1]] === 1
    //             //     ||
    //             //     protectGridSet[position[0] + 1][position[1]] === 1) {
    //             //     // 受保护点不可删
    //             //     // console.log(`保护连接点: [${position[0]}, ${position[1]}]`)
    //             //     continue
    //             // }
    //             dzOfCoords[position[0]][position[1]].bottom = undefined
    //             dzOfCoords[position[0] + 1][position[1]].up = undefined
    //             // console.log(`去掉连接: [${position[0]},${position[1]}] - bottom`)
    //         }
    //         if (direction === 'right') {
    //             // if (protectGridSet[position[0]][position[1]] === 1
    //             //     ||
    //             //     protectGridSet[position[0]][position[1] + 1] === 1) {
    //             //     // 受保护点不可删
    //             //     // console.log(`保护连接点: [${position[0]}, ${position[1]}]`)
    //             //     continue
    //             // }
    //             dzOfCoords[position[0]][position[1]].right = undefined
    //             dzOfCoords[position[0]][position[1] + 1].left = undefined
    //             // console.log(`去掉连接: [${position[0]},${position[1]}] - right`)
    //         }
    //         validDzList.splice(i, 1)
    //     }
    // }

    // -------------------------------------
    // 5、计算所有点斜率的均值, 根据和均值的差确定每个点的优先级, 越靠近均值, 越在山峰附近
    // 计算方差, 寻找离群值, 设置为不可到达
    // 期望上述操作能把从托槽底面到托槽头部的路径全部去掉
    // -------------------------------------
    // // validDzList少于4倍的点数(如边界)并且存在固定的2倍重复(路径有向), 这种重复将均值置为0, 但这种有向图可以很简单的转变为无向图:
    // // A->B为right, 则对应A<-B有left, up/bottom同理一个up一定对应一个bottom, 因此只取bottom和right路径即可解决问题
    // // 注意: g x g 个点 存在 2g(g-1)条无向路径(即有效路径上限值)
    // // 根据所有有效斜率, 计算均值和方差

    // let meanOfValidDzList = validDzList.reduce((prevSum, currDz)=>prevSum+currDz.value, 0) / validDzList.length
    // let stdOfValidDzList = Math.sqrt(
    //     validDzList.reduce((prevSum, currDz)=>prevSum + (currDz.value - meanOfValidDzList)**2, 0) / (validDzList.length - 1 + 1e-8)
    // )
    // // 去掉在 u-2sigma~u+2sigma 以外的离群点 (假设数据服从高斯分布, 置信度选择95%)
    // // let validBound = Math.max(2 * stdOfValidDzList + 1e-3, 0.05)
    // let validBound = 2 * stdOfValidDzList + 1e-3

    // // 保护位置: z值最小的前10%的点(保证在底面)不可作为离群值删除
    // let protectPosList = gridCoordsProjOnBracket.map(
    //     (row, i)=>row.map(
    //         (p, j)=>({pos: [i, j], z: p[2]})
    //     )
    // ).flat(1)
    // .filter(item=>item.z !== undefined) // ! 去掉undefined !

    // protectPosList.sort((a,b)=>a.z-b.z)
    // // console.log('受保护z值排序',protectPosList.map(item=>item.z))
    // // 最少保护10个点
    // protectPosList.splice(Math.max(Math.round(protectPosList.length * 0.15), 10), protectPosList.length)
    // let protectGridSet = new Array(gridSize)
    // for (let i = 0; i < gridSize; i++) {
    //     protectGridSet[i] = new Array(gridSize).fill(0)
    // }
    // protectPosList.forEach(({pos})=>protectGridSet[pos[0]][pos[1]] = 1)

    // console.log('受保护位置')
    // protectGridSet.forEach((row, i)=>console.log(i, row))

    // // 计算每个点偏离均值的距离
    // validDzList.forEach((item)=>item.value = Math.abs(item.value - meanOfValidDzList))
    // // 从小到大排序
    // validDzList.sort((a,b)=>a.value-b.value)
    // for (let i = validDzList.length - 1; i >= 0; i--) {
    //     let {position, direction, value} = validDzList[i]
    //     if (protectGridSet[position[0]][position[1]] === 1) {
    //         // 受保护点不可删
    //         // console.log(`保护连接点: [${position[0]}, ${position[1]}]`)
    //         continue
    //     }
    //     if (value > validBound) {
    //         console.log('一阶导离群值点', position)
    //         // 一个无向图, 要去掉两个对应的有向路径
    //         if (direction === 'bottom') {
    //             // if (protectGridSet[position[0]][position[1]] === 1
    //             //     ||
    //             //     protectGridSet[position[0] + 1][position[1]] === 1) {
    //             //     // 受保护点不可删
    //             //     // console.log(`保护连接点: [${position[0]}, ${position[1]}]`)
    //             //     continue
    //             // }
    //             dzOfCoords[position[0]][position[1]].bottom = undefined
    //             dzOfCoords[position[0] + 1][position[1]].up = undefined
    //             // console.log(`去掉连接: [${position[0]},${position[1]}] - bottom`)
    //         }
    //         if (direction === 'right') {
    //             // if (protectGridSet[position[0]][position[1]] === 1
    //             //     ||
    //             //     protectGridSet[position[0]][position[1] + 1] === 1) {
    //             //     // 受保护点不可删
    //             //     // console.log(`保护连接点: [${position[0]}, ${position[1]}]`)
    //             //     continue
    //             // }
    //             dzOfCoords[position[0]][position[1]].right = undefined
    //             dzOfCoords[position[0]][position[1] + 1].left = undefined
    //             // console.log(`去掉连接: [${position[0]},${position[1]}] - right`)
    //         }
    //         validDzList.splice(i, 1)
    //     }
    // }
    // console.log(`有效连接数: ${validDzList.length}/${2*gridSize*(gridSize-1)}`)

    // -------------------------------------
    // 6、剩余路径, 以起始点为z值最小的棋盘点(假设必定在底面)开始膨胀, 直至膨胀完全
    // -------------------------------------
    let expandSet = new Array(gridSize),
        isThisTimeExpand = true,
        thisTimeExpandSet = new Array(gridSize),
        recordOfMinZ = Infinity,
        initPos = [0, 0];
    for (let i = 0; i < gridSize; i++) {
        expandSet[i] = new Array(gridSize).fill(0);
        thisTimeExpandSet[i] = new Array(gridSize).fill(0);
    }
    // 以z值最小的点作为膨胀起始点, 由于保护, 该点不会孤立
    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            if (
                gridCoordsProjOnBracket[i][j][2] &&
                gridCoordsProjOnBracket[i][j][2] < recordOfMinZ
            ) {
                initPos[0] = i;
                initPos[1] = j;
                recordOfMinZ = gridCoordsProjOnBracket[i][j][2];
            }
        }
    }
    // console.log('初始膨胀位置', initPos)

    expandSet[initPos[0]][initPos[1]] = 1;
    thisTimeExpandSet[initPos[0]][initPos[1]] = 1;
    while (isThisTimeExpand) {
        isThisTimeExpand = false;
        // 本次膨胀, 设置为2 (1: 上一次膨胀的边缘一圈点, 做为本次膨胀的种子点)
        thisTimeExpandSet.forEach((row, i) => {
            row.forEach((val, j) => {
                if (val === 1) {
                    let { up, bottom, right, left } = dzOfCoords[i][j];
                    // 注意在边界时dzOfCoords也已经设置为undefined
                    if (up !== undefined && expandSet[i - 1][j] === 0) {
                        expandSet[i - 1][j] = 1;
                        thisTimeExpandSet[i - 1][j] = 2;
                        isThisTimeExpand = true;
                    }
                    if (bottom !== undefined && expandSet[i + 1][j] === 0) {
                        expandSet[i + 1][j] = 1;
                        thisTimeExpandSet[i + 1][j] = 2;
                        isThisTimeExpand = true;
                    }
                    if (left !== undefined && expandSet[i][j - 1] === 0) {
                        expandSet[i][j - 1] = 1;
                        thisTimeExpandSet[i][j - 1] = 2;
                        isThisTimeExpand = true;
                    }
                    if (right !== undefined && expandSet[i][j + 1] === 0) {
                        expandSet[i][j + 1] = 1;
                        thisTimeExpandSet[i][j + 1] = 2;
                        isThisTimeExpand = true;
                    }
                }
            });
        });
        // 膨胀完毕, 全部减1(本次膨胀的点2作为下一次膨胀的种子点1)
        thisTimeExpandSet.forEach((row, i) => {
            row.forEach((val, j) => {
                switch (val) {
                    case 1: {
                        thisTimeExpandSet[i][j] = 0;
                        break;
                    }
                    case 2: {
                        thisTimeExpandSet[i][j] = 1;
                        break;
                    }
                }
            });
        });
    }
    // 得到最后的底面点
    let filterGridCoords = [];
    gridCoordsProjOnBracket.forEach((row, i) => {
        row.forEach((val, j) => {
            if (expandSet[i][j] === 1) {
                filterGridCoords.push(val);
            }
        });
    });
    // console.log('膨胀集')
    // expandSet.forEach((row, i)=>console.log(i, row))
    // -------------------------------------
    // 7、这些筛选棋盘点, 取最外圈一圈轮廓对应的点作为托槽底面40点
    // -------------------------------------
    let bracketBottomPointValues = new Float32Array(gridSize * 4 * 3),
        bottomPIdx = 0;
    for (let j = 0; j < gridSize; j++) {
        // 最上圈-取xMin
        for (let i = 0; i < gridSize; i++) {
            if (expandSet[i][j] === 1) {
                bracketBottomPointValues[bottomPIdx++] =
                    gridCoordsProjOnBracket[i][j][1];
                bracketBottomPointValues[bottomPIdx++] =
                    gridCoordsProjOnBracket[i][j][2];
                bracketBottomPointValues[bottomPIdx++] =
                    gridCoordsProjOnBracket[i][j][0];
                break;
            }
        }
        // 最下圈-取xMax
        for (let i = gridSize - 1; i >= 0; i--) {
            if (expandSet[i][j] === 1) {
                bracketBottomPointValues[bottomPIdx++] =
                    gridCoordsProjOnBracket[i][j][1];
                bracketBottomPointValues[bottomPIdx++] =
                    gridCoordsProjOnBracket[i][j][2];
                bracketBottomPointValues[bottomPIdx++] =
                    gridCoordsProjOnBracket[i][j][0];
                break;
            }
        }
    }
    for (let i = 0; i < gridSize; i++) {
        // 最左圈-取yMin
        for (let j = 0; j < gridSize; j++) {
            if (expandSet[i][j] === 1) {
                bracketBottomPointValues[bottomPIdx++] =
                    gridCoordsProjOnBracket[i][j][1];
                bracketBottomPointValues[bottomPIdx++] =
                    gridCoordsProjOnBracket[i][j][2];
                bracketBottomPointValues[bottomPIdx++] =
                    gridCoordsProjOnBracket[i][j][0];
                break;
            }
        }
        // 最右圈-取yMax
        for (let j = gridSize - 1; j >= 0; j--) {
            if (expandSet[i][j] === 1) {
                bracketBottomPointValues[bottomPIdx++] =
                    gridCoordsProjOnBracket[i][j][1];
                bracketBottomPointValues[bottomPIdx++] =
                    gridCoordsProjOnBracket[i][j][2];
                bracketBottomPointValues[bottomPIdx++] =
                    gridCoordsProjOnBracket[i][j][0];
                break;
            }
        }
    }
    bracketBottomPointValues = bracketBottomPointValues.subarray(0, bottomPIdx);

    // -------------------------------------
    // 8、根据这些筛选棋盘点, 近似拟合一个平面, 求取该平面法向量, 作为近似托槽底面的法向量
    // -------------------------------------
    // 在x-z和y-z平面, 3x3个点拟合两条直线
    // 注意gridCoord为 [x,y,z]格式
    let fittingCoords = filterGridCoords.map((p) => [p[0], p[2]]),
        numberOfSamples = fittingCoords.length,
        fittingCoordsX = new Array(numberOfSamples),
        fittingCoordsY = new Array(numberOfSamples),
        mXZ = [[0], [0]], // (2, 1)  [[b:常数项], [k:一次项]]
        mYZ = [[0], [0]]; // (2, 1)  [[b:常数项], [k:一次项]]
    for (let i = 0; i < numberOfSamples; i++) {
        fittingCoordsX[i] = new Array(2);
        fittingCoordsY[i] = [fittingCoords[i][1]];
        for (let j = 0; j < 2; j++) {
            fittingCoordsX[i][j] = fittingCoords[i][0] ** j;
        }
    }
    solveLeastSquares(
        numberOfSamples,
        fittingCoordsX,
        2,
        fittingCoordsY,
        1,
        mXZ,
        true
    );

    fittingCoords = filterGridCoords.map((p) => [p[1], p[2]]);
    numberOfSamples = fittingCoords.length;
    fittingCoordsX = new Array(numberOfSamples);
    fittingCoordsY = new Array(numberOfSamples);
    for (let i = 0; i < numberOfSamples; i++) {
        fittingCoordsX[i] = new Array(2);
        fittingCoordsY[i] = [fittingCoords[i][1]];
        for (let j = 0; j < 2; j++) {
            fittingCoordsX[i][j] = fittingCoords[i][0] ** j;
        }
    }
    solveLeastSquares(
        numberOfSamples,
        fittingCoordsX,
        2,
        fittingCoordsY,
        1,
        mYZ,
        true
    );

    // m中即为所求系数
    let n1 = [1, 0, mXZ[1][0]],
        n2 = [0, 1, mYZ[1][0]],
        estimateDirectionOfBracketBottom = [0, 0, 0];
    normalize(n1);
    normalize(n2);
    cross(n1, n2, estimateDirectionOfBracketBottom);
    // 大于90度则反向180度
    if (
        degreesFromRadians(
            angleBetweenVectors([0, 0, 1], estimateDirectionOfBracketBottom)
        ) > 90
    ) {
        multiplyScalar(estimateDirectionOfBracketBottom, -1);
    }
    // 归一化
    normalize(estimateDirectionOfBracketBottom);
    // console.log(`托槽底面和z轴大致夹角: ${degreesFromRadians(angleBetweenVectors([0,0,1], estimateDirectionOfBracketBottom)).toFixed(2)}`)

    // -------------------------------------
    // 9、根据该估计法向量转换整个托槽数据, 使托槽底面要近似垂直z轴, 即要从近似法向量(歪)转到z轴(正)
    // -------------------------------------
    let transBracketPointValues = new Float32Array(bracketPointValues);
    // 对托槽点集应用变换
    vtkMatrixBuilder
        .buildFromDegree()
        .rotateFromDirections(
            [
                estimateDirectionOfBracketBottom[1],
                estimateDirectionOfBracketBottom[2],
                estimateDirectionOfBracketBottom[0],
            ],
            [0, 1, 0]
        )
        .apply(transBracketPointValues);

    // -------------------------------------
    // 10、根据3中记录的投影点所在面片(必定是底面面片), 根据转正托槽点坐标计算zMax, 之后要求托槽底面必须小于该zMax
    // 同时注意这些面片将作为第11步的初始膨胀点
    // -------------------------------------
    // 根据faceIndexsOfGridProj设置初始膨胀面片种子点
    let expandFaceSet = [],
        thisTimeExpandFaceSet = [],
        thisTimeExpandFaceSetIndexes = [],
        idxOfExpandFaceSet = 0;
    faceIndexsOfGridProj.forEach((row, i) => {
        row.forEach((faceOffset, j) => {
            if (
                expandSet[i][j] === 1 &&
                !thisTimeExpandFaceSetIndexes.includes(faceOffset)
            ) {
                thisTimeExpandFaceSetIndexes.push(faceOffset);
                // 算z
                point1Idx = bracketFacesData[faceOffset + 1] * 3;
                point2Idx = bracketFacesData[faceOffset + 2] * 3;
                point3Idx = bracketFacesData[faceOffset + 3] * 3;
                zMax = Math.max(
                    zMax,
                    transBracketPointValues[point1Idx + 1],
                    transBracketPointValues[point2Idx + 1],
                    transBracketPointValues[point3Idx + 1]
                );
            }
        });
    });

    // -------------------------------------
    // 11、遍历面片, 根据转正托槽坐标筛选:
    // 条件1:面片法向量 和 z轴 夹角小于30°
    // 条件2:该面片所有顶点中z坐标至少有一点小于等于zMax
    // 在第3步中记录这些棋盘点所对应的面片, 作为初始膨胀点, 直至膨胀完全, 作为托槽底面面片
    // -------------------------------------
    // 面片索引去重、从小到大排序
    thisTimeExpandFaceSetIndexes.sort((a, b) => a - b);
    // 遍历托槽面片, 计算面片法向量 + 3个点的xMin, xMax, yMin, yMax
    // 并筛选符合条件的面片 作为候选集, 注意在种子点的不要加入候选集
    let filterFacesCandidateSet = [],
        faceNormal,
        p12,
        p13,
        angle;
    for (let idx = 0; idx < sizeBracketFaces; idx += 4) {
        // 根据面片索引取出对应3个顶点的索引
        point1Idx = bracketFacesData[idx + 1] * 3;
        point2Idx = bracketFacesData[idx + 2] * 3;
        point3Idx = bracketFacesData[idx + 3] * 3;
        // 从点集中读取对应顶点坐标
        point1 = [
            transBracketPointValues[point1Idx + 2],
            transBracketPointValues[point1Idx],
            transBracketPointValues[point1Idx + 1],
        ];
        point2 = [
            transBracketPointValues[point2Idx + 2],
            transBracketPointValues[point2Idx],
            transBracketPointValues[point2Idx + 1],
        ];
        point3 = [
            transBracketPointValues[point3Idx + 2],
            transBracketPointValues[point3Idx],
            transBracketPointValues[point3Idx + 1],
        ];
        // 如果在棋盘点面片索引列表中, 则直接向膨胀种子点集中加
        // 否则根据筛选条件把满足条件的加入候选集
        if (thisTimeExpandFaceSetIndexes[idxOfExpandFaceSet] === idx) {
            thisTimeExpandFaceSet.push({
                faceIndex: idx / 4,
                point1,
                point2,
                point3,
            });
            idxOfExpandFaceSet++;
            continue;
        }
        p12 = [0, 0, 0];
        p13 = [0, 0, 0];
        faceNormal = [0, 0, 0];
        subtract(point1, point2, p12);
        subtract(point1, point3, p13);
        cross(p12, p13, faceNormal);
        // angle = degreesFromRadians(angleBetweenVectors(faceNormal, estimateDirectionOfBracketBottom))
        angle = degreesFromRadians(angleBetweenVectors(faceNormal, [0, 0, 1]));
        angle = angle < 90 ? angle : 180 - angle;
        if (
            angle < angleBound &&
            Math.min(point1[2], point2[2], point3[2]) <= zMax
        ) {
            // 条件1:面片法向量 和 z轴 夹角小于30°
            // 条件2:该面片所有顶点中z坐标至少有一点小于等于zMax
            filterFacesCandidateSet.push({
                faceIndex: idx / 4,
                point1,
                point2,
                point3,
            });
        }
    }
    // 注意filterFacesCandidateSet中的faceIndex从小到大顺序排序
    let seedFace;
    // 开始找邻居膨胀, 每次膨胀, 直至某一次膨胀点数为0
    while (thisTimeExpandFaceSet.length > 0) {
        idxOfExpandFaceSet = thisTimeExpandFaceSet.length - 1;
        thisTimeExpandFaceSetIndexes.splice(
            0,
            thisTimeExpandFaceSetIndexes.length
        );
        while (idxOfExpandFaceSet >= 0) {
            // 遍历膨胀种子点, 在候选集中寻找所有邻居点, 并加入thisTimeExpandFaceSet中
            seedFace = thisTimeExpandFaceSet[idxOfExpandFaceSet];
            for (let i = 0; i < filterFacesCandidateSet.length; i++) {
                // 已经加入的索引直接跳过
                if (thisTimeExpandFaceSetIndexes.includes(i)) {
                    continue;
                }
                if (isFaceNeighbor(seedFace, filterFacesCandidateSet[i], 2)) {
                    thisTimeExpandFaceSetIndexes.push(i);
                }
            }
            idxOfExpandFaceSet--;
        }
        // 本轮作为膨胀种子点的加入expandFaceSet
        expandFaceSet.push(
            thisTimeExpandFaceSet.splice(0, thisTimeExpandFaceSet.length)
        );
        // 本轮膨胀的邻居作为下一轮膨胀种子点, 从候选集中移除(从后往前移除防止索引出问题)
        thisTimeExpandFaceSetIndexes.sort((a, b) => b - a);
        thisTimeExpandFaceSetIndexes.forEach((i) => {
            thisTimeExpandFaceSet.push(filterFacesCandidateSet.splice(i, 1)[0]);
        });
    }
    expandFaceSet = expandFaceSet.flat(1).map((item) => item.faceIndex);
    expandFaceSet.sort((a, b) => a - b);

    // // 可视化: 改变源面片构造
    // let faceOfPrevFunc = getBracketBottomFaceIndex(bracketPointValues, bracketFacesData)
    // for (let idx=0; idx < faceOfPrevFunc.length * 4; idx+=4) {
    //     // 根据面片索引取出对应3个顶点的索引
    //     bracketFacesData[idx] = 3
    //     bracketFacesData[idx + 1] = bracketFacesData[faceOfPrevFunc[idx/4] * 4 + 1]
    //     bracketFacesData[idx + 2] = bracketFacesData[faceOfPrevFunc[idx/4] * 4 + 2]
    //     bracketFacesData[idx + 3] = bracketFacesData[faceOfPrevFunc[idx/4] * 4 + 3]
    // }
    // bracketFacesData.fill(0, faceOfPrevFunc.length * 4, bracketFacesData.length)

    // // 可视化筛选底面: 改变源面片构造
    // for (let idx=0; idx < expandFaceSet.length * 4; idx+=4) {
    //     // 根据面片索引取出对应3个顶点的索引
    //     bracketFacesData[idx] = 3
    //     bracketFacesData[idx + 1] = bracketFacesData[expandFaceSet[idx/4] * 4 + 1]
    //     bracketFacesData[idx + 2] = bracketFacesData[expandFaceSet[idx/4] * 4 + 2]
    //     bracketFacesData[idx + 3] = bracketFacesData[expandFaceSet[idx/4] * 4 + 3]
    // }
    // bracketFacesData.fill(0, expandFaceSet.length * 4, bracketFacesData.length)

    // // 可视化筛选底面40点: 改变源面片构造
    // let bottomPointFaces = []
    // // 最上圈-取xMin
    // for (let j = 0; j < gridSize; j++) {
    //     for (let i = 0; i < gridSize; i++) {
    //         if (expandSet[i][j] === 1) {
    //             bottomPointFaces.push(faceIndexsOfGridProj[i][j])
    //             break
    //         }
    //     }
    // }
    // // 最下圈-取xMax
    // for (let j = 0; j < gridSize; j++) {
    //     for (let i = gridSize - 1; i >= 0; i--) {
    //         if (expandSet[i][j] === 1) {
    //             bottomPointFaces.push(faceIndexsOfGridProj[i][j])
    //             break
    //         }
    //     }
    // }
    // // 最左圈-取yMin
    // for (let i = 0; i < gridSize; i++) {
    //     for (let j = 0; j < gridSize; j++) {
    //         if (expandSet[i][j] === 1) {
    //             bottomPointFaces.push(faceIndexsOfGridProj[i][j])
    //             break
    //         }
    //     }
    // }
    // // 最右圈-取yMax
    // for (let i = 0; i < gridSize; i++) {
    //     for (let j = gridSize - 1; j >= 0; j--) {
    //         if (expandSet[i][j] === 1) {
    //             bottomPointFaces.push(faceIndexsOfGridProj[i][j])
    //             break
    //         }
    //     }
    // }
    // bottomPointFaces = [...new Set(bottomPointFaces)]
    // bottomPointFaces.sort((a,b)=>a-b)
    // for (let idx=0; idx < bottomPointFaces.length; idx++) {
    //     bracketFacesData[idx*4] = 3
    //     bracketFacesData[idx*4 + 1] = bracketFacesData[bottomPointFaces[idx] + 1]
    //     bracketFacesData[idx*4 + 2] = bracketFacesData[bottomPointFaces[idx] + 2]
    //     bracketFacesData[idx*4 + 3] = bracketFacesData[bottomPointFaces[idx] + 3]
    // }
    // bracketFacesData.fill(0, bottomPointFaces.length * 4, bracketFacesData.length)

    return { bracketBottomPointValues, bottomFaceIndexList: expandFaceSet };
}

/**
 * @description 根据几个筛选条件去近似筛选出托槽底面点, 并记录其中的面片索引, 作为该js文件内部值
 * 每次微调均直接调用该索引, 不再做重复操作
 * -----------------------------------------------------------------------------------------
 * 面片双筛选：基于法向量角度 + 基于膨胀
 * 1、由于托槽底面面片基本垂直于zNormal(法向量和zNormal平行), 因此根据角度进行筛选
 * 计算出面片法向量和zNormal夹角, 把远离0度的过滤掉,
 * 由于某些托槽底面倾斜, 所以为了防止这些底面面片被筛掉, 我们设置界限为72°, 筛掉72°~90°之间的面片, 这些面片基本和zNormal方向平行
 * 2、根据观察, 托槽底面其实是由两个平行平面组成, 基本垂直于zNormal, 连接的侧面就是和zNormal接近平行的平面, 这些面应该在上一步中被筛掉
 * 此时托槽底面应该是一个独立的面, 面片和其它部分隔开,
 * 取zMin最小的面片, 它一定是底面的面片, 以该面片为种子点向外膨胀, 加上和它相邻的面片, 循环迭代, 最终应该能获取到整个托槽底面
 * 为了鲁棒性, 设置1%面片为种子点, 通过共用顶点寻找它们的相邻面片(有1个共用就当做相邻), 直到迭代到不能扩张为止
 * 此时得到的面片作为近似底面面片
 * -----------------------------------------------------------------------------------------
 * 返回面片索引, 别返回面片数据, 数据会随托槽微调而改变, 但索引是不变的
 */
function getBracketBottomFaceIndex(
    bracketPointValues,
    bracketFacesData,
    angleBound = 72
) {
    // 注意, 此时托槽数据都还在原点处
    // let center = [0, 0, 0] // 原点
    // let xNormal = [0, 0, 1] // 左右-xNormal
    // let yNormal = [1, 0, 0] // 上下-yNormal
    // let zNormal = [0, 1, 0] // 前后-zNormal
    // 即对于每个点的坐标值直接对应投影坐标[yProj, zProj, xProj]
    // -----------------------------------------------------------------------------------------
    // 循环1：遍历托槽面片, 按索引取出3个点, 据此计算各面片在zNormal上的投影坐标最大值zMax和最小值zMin,
    // 以及各筛选面片法向量和zNormal角度
    // -----------------------------------------------------------------------------------------
    let numBracketFaces = bracketFacesData.length / 4;
    let facesDetailData = [];
    for (let facesIdx = 0; facesIdx < numBracketFaces; facesIdx++) {
        // 根据面片索引取出对应3个顶点的索引
        const fbOffset = facesIdx * 4;
        const point1Idx = bracketFacesData[fbOffset + 1] * 3;
        const point2Idx = bracketFacesData[fbOffset + 2] * 3;
        const point3Idx = bracketFacesData[fbOffset + 3] * 3;
        // 从点集中读取对应顶点坐标
        const point1 = [
            bracketPointValues[point1Idx],
            bracketPointValues[point1Idx + 1],
            bracketPointValues[point1Idx + 2],
        ];
        const point2 = [
            bracketPointValues[point2Idx],
            bracketPointValues[point2Idx + 1],
            bracketPointValues[point2Idx + 2],
        ];
        const point3 = [
            bracketPointValues[point3Idx],
            bracketPointValues[point3Idx + 1],
            bracketPointValues[point3Idx + 2],
        ];

        const p12 = [0, 0, 0];
        const p13 = [0, 0, 0];
        const faceNormal = [0, 0, 0];
        subtract(point1, point2, p12);
        subtract(point1, point3, p13);
        cross(p12, p13, faceNormal);
        // 计算各筛选面片法向量和zNormal角度
        const angle = degreesFromRadians(
            angleBetweenVectors(faceNormal, [0, 1, 0])
        );

        facesDetailData.push({
            faceIndex: facesIdx,
            point1,
            point2,
            point3,
            zMin: Math.min(point1[1], point2[1], point3[1]),
            zMax: Math.max(point1[1], point2[1], point3[1]),
            // 注意法向量可能反向, 钝角需要通过互补转换为相应的锐角角度
            angle: angle < 90 ? angle : 180 - angle,
        });
    }
    // return facesDetailData.filter(item=>item.angle < angleBound).map(item => item.faceIndex)
    // 膨胀
    facesDetailData = bracketBottomFaceExpand(
        facesDetailData.filter((item) => item.angle < angleBound)
    );
    // console.log(`筛选: ${facesDetailData.length}/${numBracketFaces}`)
    return facesDetailData.map((item) => item.faceIndex);
}

/**
 * @description 计算托槽面片与牙齿点集之间沿zNormal方向的最短距离
 * @param bottomFaceIndexList 托槽底部面片索引集
 * @param bracketPointValues 托槽点集 typedArray
 * @param bracketFacesData array 托槽面片数据,4个一组
 * @param toothPointValues 牙齿点集 typedArray
 * @param xNormal 托槽法向量(左右)
 * @param yNormal 托槽法向量(上下)
 * @param zNormal 托槽法向量(前后), 正方向指向托槽远离牙齿方向
 */
function calculateMinDistBetweenFacesAndPointsAlongAxis(
    bottomFaceIndexList,
    bracketPointValues,
    bracketFacesData,
    toothPointValues,
    xNormal,
    yNormal,
    zNormal
) {
    // 根据底部面片索引取出对应面片数据, 同时计算出最大XY投影边界用于后续筛选牙齿点集
    let boundOfBracketXY = [Infinity, -Infinity, Infinity, -Infinity]; // xmin, xmax, ymin, ymax
    let selectedBracketFaces = [];
    for (let faceIdx of bottomFaceIndexList) {
        // 根据面片索引取出对应3个顶点的索引
        const fbOffset = faceIdx * 4;
        const point1Idx = bracketFacesData[fbOffset + 1] * 3;
        const point2Idx = bracketFacesData[fbOffset + 2] * 3;
        const point3Idx = bracketFacesData[fbOffset + 3] * 3;
        // 从点集中读取对应顶点坐标
        const point1 = [
            bracketPointValues[point1Idx],
            bracketPointValues[point1Idx + 1],
            bracketPointValues[point1Idx + 2],
        ];
        const point2 = [
            bracketPointValues[point2Idx],
            bracketPointValues[point2Idx + 1],
            bracketPointValues[point2Idx + 2],
        ];
        const point3 = [
            bracketPointValues[point3Idx],
            bracketPointValues[point3Idx + 1],
            bracketPointValues[point3Idx + 2],
        ];

        // 计算xNormal投影坐标
        const xProj1 = projectToAxis(xNormal, point1);
        const xProj2 = projectToAxis(xNormal, point2);
        const xProj3 = projectToAxis(xNormal, point3);
        // 计算yNormal投影坐标
        const yProj1 = projectToAxis(yNormal, point1);
        const yProj2 = projectToAxis(yNormal, point2);
        const yProj3 = projectToAxis(yNormal, point3);
        // 计算zNormal投影坐标
        const zProj1 = projectToAxis(zNormal, point1);
        const zProj2 = projectToAxis(zNormal, point2);
        const zProj3 = projectToAxis(zNormal, point3);

        // 边界更新
        boundOfBracketXY[0] = Math.min(
            boundOfBracketXY[0],
            xProj1,
            xProj2,
            xProj3
        ); // xmin
        boundOfBracketXY[1] = Math.max(
            boundOfBracketXY[1],
            xProj1,
            xProj2,
            xProj3
        ); // xmax
        boundOfBracketXY[2] = Math.min(
            boundOfBracketXY[2],
            yProj1,
            yProj2,
            yProj3
        ); // ymin
        boundOfBracketXY[3] = Math.max(
            boundOfBracketXY[3],
            yProj1,
            yProj2,
            yProj3
        ); // ymax

        selectedBracketFaces.push({
            point1: [xProj1, yProj1, zProj1],
            point2: [xProj2, yProj2, zProj2],
            point3: [xProj3, yProj3, zProj3],
            xMin: Math.min(xProj1, xProj2, xProj3),
            xMax: Math.max(xProj1, xProj2, xProj3),
            yMin: Math.min(yProj1, yProj2, yProj3),
            yMax: Math.max(yProj1, yProj2, yProj3),
            zMin: Math.min(zProj1, zProj2, zProj3),
            zMax: Math.max(zProj1, zProj2, zProj3),
        });
    }
    // console.log('边界计算 xMin xMax yMin yMax', boundOfBracketXY[0], boundOfBracketXY[1], boundOfBracketXY[2], boundOfBracketXY[3])
    let numSelectedFaces = selectedBracketFaces.length;

    // -----------------------------------------------------------------------------------------
    // 循环3：遍历牙齿点, 利用边界筛选牙齿点集, 计算3法向量投影坐标
    // -----------------------------------------------------------------------------------------
    let sizeToothPoints = toothPointValues.length;
    let selectedProjOfTooth = []; // 直接挑出来
    for (let toothIdx = 0; toothIdx < sizeToothPoints; toothIdx += 3) {
        // 为每个牙齿点计算xNormal, yNormal方向的投影坐标
        const toothPoint = [
            toothPointValues[toothIdx],
            toothPointValues[toothIdx + 1],
            toothPointValues[toothIdx + 2],
        ];
        const xProjOfTooth = projectToAxis(xNormal, toothPoint);
        const yProjOfTooth = projectToAxis(yNormal, toothPoint);
        // 只挑出在边界范围内的点
        if (
            xProjOfTooth > boundOfBracketXY[0] &&
            xProjOfTooth < boundOfBracketXY[1] &&
            yProjOfTooth > boundOfBracketXY[2] &&
            yProjOfTooth < boundOfBracketXY[3]
        ) {
            // 计算zNormal投影坐标并保存至列表
            const zProjOfTooth = projectToAxis(zNormal, toothPoint);
            selectedProjOfTooth.push([
                xProjOfTooth,
                yProjOfTooth,
                zProjOfTooth,
            ]);
        }
    }
    // console.log(`筛选牙齿点数: ${selectedProjOfTooth.length}/${sizeToothPoints}`)

    // -----------------------------------------------------------------------------------------
    // 循环4：二重循环,遍历筛选牙齿点,遍历筛选托槽面片,计算每个牙齿点沿zNormal方向到各个面片的交点距离, 寻找其中的最小值
    // -----------------------------------------------------------------------------------------
    let minDist = Infinity;
    // let numSelectedTooth = selectedProjOfTooth.length
    // console.log('筛选后牙齿点数', numSelectedTooth)
    // console.log('原二重循环数', selectedProjOfTooth.length * numSelectedFaces)
    // 托槽面片集按xMin排序, 小的优先级在前
    selectedBracketFaces.sort((a, b) => a.xMin - b.xMin);
    // 牙齿点集按xProj排序, 小的在前
    selectedProjOfTooth.sort((a, b) => a[0] - b[0]);
    // 构造递进式双重循环, 降低循环次数
    let toothStartIdx = 0; // 记录牙齿初始循环点
    // let lt = 1
    for (
        let bracketFaceIdx = 0;
        bracketFaceIdx < numSelectedFaces;
        bracketFaceIdx++
    ) {
        const { point1, point2, point3, xMin, xMax } = selectedBracketFaces[
            bracketFaceIdx
        ];
        let firstToothInXRange = true; // 记录这次遍历中牙齿点首次进入[xMin, xMax]的时间点
        for (
            let toothIdx = toothStartIdx;
            toothIdx < selectedProjOfTooth.length;
            toothIdx++
        ) {
            // lt ++
            const toothPoint = selectedProjOfTooth[toothIdx];
            // 需要满足牙齿点的xProj在面片[xMin, xMax]范围之内, 而牙齿点xProj是随循环增长的, 面片xMin也是随循环增长的
            // 因此toothStartIdx只会增大, 不会减小
            if (toothPoint[0] >= xMin && toothPoint[0] <= xMax) {
                if (firstToothInXRange) {
                    // 该次循环中这个牙齿点是第一个进入[xMin, xMax]范围的牙齿点, 前面的牙齿点全部小于xMin,
                    // 由于xMin只会随循环继续提高, 所以在后续的循环中可以直接忽略了前面的牙齿点, 它们的xProj一定是小于xMin的
                    toothStartIdx = toothIdx;
                    firstToothInXRange = false;
                }
                // 如果xProj满足范围, 则从点集中抽出该点进行计算
                const dist = pointDistanceWithPlaneAlongAxis(
                    point1,
                    point2,
                    point3,
                    toothPoint
                );
                minDist = Math.min(minDist, dist);
            }
            if (toothPoint[0] > xMax) {
                // 不用再往后了, 往后牙齿的xProj只会更大, 一定大于xMax
                break;
            }
        }
    }
    // console.log(`双重循环次数${lt}/${selectedProjOfTooth.length * numSelectedFaces}, 降低为${lt/selectedProjOfTooth.length/numSelectedFaces * 100}%`)

    // console.log('最短距离', minDist)
    return minDist;
}

/**
 * @description 判断移动后的托槽是否越界,是的话则当次微调无效
 * 越界：移动后的托槽中心沿zNormal射出一条直线,如果该直线没有经过牙齿模型上任何一个点,则认为该次移动越界
 * @param toothPointValues 牙齿点集 typedArray
 * @param center 表示托槽目标要达到的位置的中心点
 * @param zNormal 单位法向量
 * @param tolerance 容差, 如果最小距离小于容差,则认为是有牙齿点在该直线上的
 */
function crossTheBorder(toothPointValues, center, zNormal, tolerance = 0.4) {
    // 构造中心点沿zNormal移动固定距离之后的点
    let coord = [
        center[0] - zNormal[0],
        center[1] - zNormal[1],
        center[2] - zNormal[2],
    ];

    // 遍历牙齿点集, 计算出每个点距离该条射线的距离,寻找最小值
    let minDist = Infinity;
    const size = toothPointValues.length;

    for (let index = 0; index < size; index += 3) {
        minDist = Math.min(
            distanceToLine(center, coord, [
                toothPointValues[index],
                toothPointValues[index + 1],
                toothPointValues[index + 2],
            ]),
            minDist
        );
    }
    // console.log('最短距离', minDist)
    // 若最小距离大于容差,则认为越界,返回true
    // 若最小距离小于容差,则认为未越界,返回false
    return minDist > tolerance;
}

/**
 * @description 得到托槽底面至多的40个点, 其中每10个点来源于一个边,
 * 此处首先沿托槽中心点向zNormal方向即牙齿贴合面方向10个单位距离构造一个大平面
 * 保证该平面在托槽底面以下, 甚至相交于牙齿, 然后为这个平面计算4个角坐标, 依次能得到4条直线,
 * 每条直线作10等分, 得到40个点, 再计算托槽点集中距离这40个点最近的40个点, 这40个点一定是托槽底面的点
 * 我们返回这40个点用于描述托槽底面轮廓
 * @param bracketPointValues 托槽点集 typedArray
 */
function getBracketBottom40PointsIndex(
    bracketPointValues,
    zNormalStandard = undefined
) {
    // 注意, 此时托槽数据都还在原点处
    // let center = [0, 0, 0] // 原点
    let xNormal = [0, 0, 1]; // 左右-xNormal
    let yNormal = [1, 0, 0]; // 上下-yNormal
    let zNormal = [0, 1, 0]; // 前后-zNormal
    if (zNormalStandard !== undefined) {
        vtkMatrixBuilder
            // 设置角度格式为degree(弧度用buildFromRadian)
            .buildFromDegree()
            .rotateFromDirections([0, 1, 0], zNormalStandard)
            // 应用到点集
            .apply(xNormal)
            .apply(yNormal)
            .apply(zNormal);
    }
    // 即对于每个点的坐标值直接对应投影坐标[yProj, zProj, xProj]
    let sizeBracketPoints = bracketPointValues.length; // 托槽点数
    let normalDist = [
        Infinity,
        -Infinity, // xmin, xmax
        Infinity,
        -Infinity, // ymin, ymax
        Infinity,
        -Infinity, // zmin, zmax
    ]; // xNormal, yNormal, zNormal上的最大最小值
    for (let idx = 0; idx < sizeBracketPoints; idx += 3) {
        let point = [
            bracketPointValues[idx],
            bracketPointValues[idx + 1],
            bracketPointValues[idx + 2],
        ]; // [yProj, zProj, xProj]
        // normalDist = [
        //     Math.min(normalDist[0], point[2]), Math.max(normalDist[1], point[2]),
        //     Math.min(normalDist[2], point[0]), Math.max(normalDist[3], point[0]),
        //     Math.min(normalDist[4], point[1]), Math.max(normalDist[5], point[1]),
        // ]

        point = [
            projectToAxis(xNormal, point),
            projectToAxis(yNormal, point),
            projectToAxis(zNormal, point),
        ];
        normalDist = [
            Math.min(normalDist[0], point[0]),
            Math.max(normalDist[1], point[0]),
            Math.min(normalDist[2], point[1]),
            Math.max(normalDist[3], point[1]),
            Math.min(normalDist[4], point[2]),
            Math.max(normalDist[5], point[2]),
        ];
    }

    let distance = Math.max(
        normalDist[1] - normalDist[0],
        normalDist[3] - normalDist[2]
    ); // 确保该平面宽度能覆盖整个托槽

    // // 往下到托槽底面以下的平面中心点
    // let bottomCenter = [0, - (normalDist[5]-normalDist[4]) * 5, 0]
    // // 计算该平面4个角点
    // let bottomCorner = [
    //     [
    //         bottomCenter[0] - distance,
    //         bottomCenter[1],
    //         bottomCenter[2] - distance,
    //     ],
    //     [
    //         bottomCenter[0] + distance,
    //         bottomCenter[1],
    //         bottomCenter[2] + distance,
    //     ],
    //     [
    //         bottomCenter[0] + distance,
    //         bottomCenter[1],
    //         bottomCenter[2] - distance,
    //     ],
    //     [
    //         bottomCenter[0] - distance,
    //         bottomCenter[1],
    //         bottomCenter[2] + distance,
    //     ]
    // ]
    // 往下到托槽底面以下的平面中心点
    let bottomCenter = [0, 0, 0];
    let subdist = normalDist[5] - normalDist[4];
    multiplyScalar(zNormal, subdist);
    subtract(bottomCenter, zNormal, bottomCenter);
    // 计算该平面4个角点
    let bottomCorner = [
        [bottomCenter[0], bottomCenter[1], bottomCenter[2]],
        [bottomCenter[0], bottomCenter[1], bottomCenter[2]],
        [bottomCenter[0], bottomCenter[1], bottomCenter[2]],
        [bottomCenter[0], bottomCenter[1], bottomCenter[2]],
    ];
    multiplyScalar(xNormal, distance);
    multiplyScalar(yNormal, distance);
    subtract(bottomCorner[0], xNormal, bottomCorner[0]);
    subtract(bottomCorner[0], yNormal, bottomCorner[0]);
    add(bottomCorner[1], xNormal, bottomCorner[1]);
    add(bottomCorner[1], yNormal, bottomCorner[1]);
    subtract(bottomCorner[2], xNormal, bottomCorner[2]);
    add(bottomCorner[2], yNormal, bottomCorner[2]);
    add(bottomCorner[3], xNormal, bottomCorner[3]);
    subtract(bottomCorner[3], yNormal, bottomCorner[3]);

    // console.log('bottomCorner1', bottomCorner)
    // 根据4角点得到40个等分点
    const bottomPlanePoints = [
        ...getDevidedPoints(bottomCorner[0], bottomCorner[1], 10),
        ...getDevidedPoints(bottomCorner[1], bottomCorner[2], 10),
        ...getDevidedPoints(bottomCorner[2], bottomCorner[3], 10),
        ...getDevidedPoints(bottomCorner[3], bottomCorner[0], 10),
    ];

    let numBracketPoints = Math.round(sizeBracketPoints / 3);

    // 计算托槽点集中分别距离这40个点最近的40个点
    let bottom40PointIndexList = [];
    for (let pointOfPlane of bottomPlanePoints) {
        let closestPointIndex = -1;
        let minDist2 = Infinity;
        for (let pointIndex = 0; pointIndex < numBracketPoints; pointIndex++) {
            const pointOffset = pointIndex * 3;
            let pointOfBracket = [
                bracketPointValues[pointOffset],
                bracketPointValues[pointOffset + 1],
                bracketPointValues[pointOffset + 2],
            ];
            let currDist2 = vtkMath.distance2BetweenPoints(
                pointOfPlane,
                pointOfBracket
            );
            if (currDist2 < minDist2) {
                closestPointIndex = pointIndex;
                minDist2 = currDist2;
            }
        }
        bottom40PointIndexList.push(closestPointIndex);
    }
    // 去重
    bottom40PointIndexList = [...new Set(bottom40PointIndexList)];
    // console.log('得到底部点', bottom40PointIndexList.length)

    let p = [
        Infinity,
        -Infinity, // xmin, xmax
        Infinity,
        -Infinity, // ymin, ymax
        Infinity,
        -Infinity, // zmin, zmax
    ];
    bottom40PointIndexList.forEach((idx) => {
        let point = [
            bracketPointValues[idx * 3],
            bracketPointValues[idx * 3 + 1],
            bracketPointValues[idx * 3 + 2],
        ]; // [yProj, zProj, xProj]
        p = [
            Math.min(p[0], point[2]),
            Math.max(p[1], point[2]),
            Math.min(p[2], point[0]),
            Math.max(p[3], point[0]),
            Math.min(p[4], point[1]),
            Math.max(p[5], point[1]),
        ];
    });

    // console.log(`全托槽范围: ${normalDist[0]}~${normalDist[1]} ${normalDist[2]}~${normalDist[3]} ${normalDist[4]}~${normalDist[5]}`)
    // console.log(`底部${bottom40PointIndexList.length}点范围: ${p[0]}~${p[1]} ${p[2]}~${p[3]} ${p[4]}~${p[5]}`)

    return bottom40PointIndexList;
}

/**
 * @description 根据coord1和coord2得到两点中间平均的10等分点
 * @param coord1 点1
 * @param coord2 点2
 * @param num 等分点数量(10)
 */
function getDevidedPoints(coord1, coord2, num = 10) {
    const orient = [
        coord2[0] - coord1[0],
        coord2[1] - coord1[1],
        coord2[2] - coord1[2],
    ]; // coord1->coord2
    let ret = [];
    for (let index = 0; index < num; index++) {
        let step = (index + 1) / (num + 1); // 1/11,2/11,3/11...,10/11
        ret.push([
            coord1[0] + orient[0] * step,
            coord1[1] + orient[1] * step,
            coord1[2] + orient[2] * step,
        ]);
    }
    return ret;
}

/**
 * @description 得到托槽底面的40个点后,需要极端牙齿上最贴近这40个点的40个点作为对应(顺序须一致)
 * @param toothPointValues 牙齿点集 typedArray
 * @param bracketBottomPointValues 托槽底面选出的40个点
 */
function getClosestPointsOnTooth(toothPointValues, bracketBottomPointValues) {
    const numBracketPoints = bracketBottomPointValues.length;
    const sizeToothPoints = toothPointValues.length;
    const toothClosestPoints = [];

    for (let index = 0; index < numBracketPoints; index += 3) {
        const pointOfBracket = bracketBottomPointValues.subarray(
            index,
            index + 3
        );
        // const pointOfBracket = bracketBottomPoints[index]

        let closestPoint = [
            toothPointValues[0],
            toothPointValues[1],
            toothPointValues[2],
        ];
        let minDist2 =
            (pointOfBracket[0] - closestPoint[0]) ** 2 +
            (pointOfBracket[1] - closestPoint[1]) ** 2 +
            (pointOfBracket[2] - closestPoint[2]) ** 2;
        for (let idxTooth = 3; idxTooth < sizeToothPoints; idxTooth += 3) {
            const pointOfTooth = [
                toothPointValues[idxTooth],
                toothPointValues[idxTooth + 1],
                toothPointValues[idxTooth + 2],
            ];
            const currDist2 =
                (pointOfBracket[0] - pointOfTooth[0]) ** 2 +
                (pointOfBracket[1] - pointOfTooth[1]) ** 2 +
                (pointOfBracket[2] - pointOfTooth[2]) ** 2;
            if (currDist2 < minDist2) {
                closestPoint = [
                    pointOfTooth[0],
                    pointOfTooth[1],
                    pointOfTooth[2],
                ];
                minDist2 = currDist2;
            }
        }
        toothClosestPoints.push([...closestPoint]);
    }

    return toothClosestPoints;
}

/**
 * @description 计算从托槽底面到牙齿面最贴合的刚体配准转换
 * 计算时若托槽内嵌于牙齿会出问题?需要先移出来?先不考虑这个.
 * @param bracketBottomPointValues 托槽底面40点
 * @param toothPointValues 牙齿点集 typedArray
 */
function getMostFitLandmarkTransform(
    bracketBottomPointValues,
    toothPointValues
) {
    // 构造托槽底面40点
    // const bracketBottomPoints = []
    // for (let pointIndex of bottom40PointIndexList) {
    //     let pointOffset = pointIndex * 3
    //     bracketBottomPoints.push([
    //         bracketPointValues[pointOffset],
    //         bracketPointValues[pointOffset + 1],
    //         bracketPointValues[pointOffset + 2],
    //     ])
    // }

    // 构造对应牙齿40点
    const toothClosestPoints = getClosestPointsOnTooth(
        toothPointValues,
        bracketBottomPointValues
    );

    const bp = vtkPoints.newInstance();
    bp.setData(bracketBottomPointValues);
    const tp = vtkPoints.newInstance();
    tp.setData(toothClosestPoints.flat(1));

    const transform = vtkLandmarkTransform.newInstance();
    // 指定刚性变换（移动+旋转）
    transform.setMode(Mode.RIGID_BODY);
    // 设置源点集为托槽底面40点
    transform.setSourceLandmark(bp);
    // 设置目标点集为牙齿贴合面40点
    transform.setTargetLandmark(tp);

    transform.update();
    return transform;
}

/**
 * @description 对托槽点集进行对应平移(translate)操作
 * @param bracketPointValues 托槽点集 typedArray
 * @param transDist 平移距离
 */
function pointsTranslateTransform(bracketPointValues, transDist) {
    // 应用平移变换
    vtkMatrixBuilder
        // 针对旋转的设置
        .buildFromDegree()
        // 应用平移变换
        .translate(...transDist)
        // 应用到托槽点集
        .apply(bracketPointValues);
}

/**
 * @description 对托槽点集进行对应旋转(rotate)操作, 旋转后反向平移, 保持旋转中心点不变(不需要在(0,0,0)点)
 * @param bracketPointValues 托槽点集 typedArray
 * @param transCenter 旋转中心(即托槽中心点)
 * @param transNormal 旋转法向量
 * 逆时针+zNormal/顺时针-zNormal/
 * 向上旋转+xNormal/向下旋转-xNormal/
 * 向右旋转+yNormal/向左旋转-yNormal
 * @param transAngle 旋转角度(degree)
 */
function pointsRotTransform(
    bracketPointValues,
    transCenter,
    transNormal,
    transAngle
) {
    // 旋转后托槽中心点可能发生偏移, 因此点集需要在旋转后经过反向平移,保持中心点不变
    let centerTranslate = new Float32Array(transCenter);

    // 中心点应用相同旋转
    vtkMatrixBuilder
        // 设置角度格式为degree(弧度用buildFromRadian)
        .buildFromDegree()
        // 绕transNormal轴旋转transAngle个角度
        .rotate(transAngle, transNormal)
        // 应用到点集
        .apply(centerTranslate);

    let recoverTransCenterTranslate = [
        transCenter[0] - centerTranslate[0],
        transCenter[1] - centerTranslate[1],
        transCenter[2] - centerTranslate[2],
    ];

    // 旋转点集
    vtkMatrixBuilder
        // 设置角度格式为degree(弧度用buildFromRadian)
        .buildFromDegree()
        // 绕transNormal轴旋转transAngle个角度
        .rotate(transAngle, transNormal)
        // 应用到托槽点集
        .apply(bracketPointValues);

    // 恢复中心
    vtkMatrixBuilder
        // 设置角度格式为degree(弧度用buildFromRadian)
        .buildFromDegree()
        // 反向平移
        .translate(...recoverTransCenterTranslate)
        // 应用到托槽点集
        .apply(bracketPointValues);
}

/**
 * @description 托槽 上下左右移动距离计算
 * @param moveType 移动类型 上|下|左|右
 * @param step 移动步长
 * @param xNormal 托槽左右法向量(上颌牙指向左侧/下颌牙指向右侧), 下颌牙提前取反
 * @param yNormal 托槽上下法向量(指向牙尖startCoor/上颌牙指向下侧/下颌牙指向上侧)
 */
function calculateBracketMoveDist(moveType, step, xNormal, yNormal) {
    let norm = 1;
    let translate = [0, 0, 0];
    switch (moveType) {
        case "UP": // 上
            norm =
                yNormal[0] * yNormal[0] +
                yNormal[1] * yNormal[1] +
                yNormal[2] * yNormal[2];
            translate = [
                (-step * yNormal[0]) / norm,
                (-step * yNormal[1]) / norm,
                (-step * yNormal[2]) / norm,
            ];
            break;
        case "DOWN": // 下
            norm =
                yNormal[0] * yNormal[0] +
                yNormal[1] * yNormal[1] +
                yNormal[2] * yNormal[2];
            translate = [
                (step * yNormal[0]) / norm,
                (step * yNormal[1]) / norm,
                (step * yNormal[2]) / norm,
            ];
            break;
        case "LEFT": // 左
            norm =
                xNormal[0] * xNormal[0] +
                xNormal[1] * xNormal[1] +
                xNormal[2] * xNormal[2];
            translate = [
                (step * xNormal[0]) / norm,
                (step * xNormal[1]) / norm,
                (step * xNormal[2]) / norm,
            ];
            break;
        case "RIGHT": // 右
            norm =
                xNormal[0] * xNormal[0] +
                xNormal[1] * xNormal[1] +
                xNormal[2] * xNormal[2];
            translate = [
                (-step * xNormal[0]) / norm,
                (-step * xNormal[1]) / norm,
                (-step * xNormal[2]) / norm,
            ];
            break;
    }
    return translate;
}

/**
 * @description 托槽 顺时针逆时针转轴计算
 * @param moveType 逆时针|顺时针
 * @param normal 托槽法向量
 */
function getBracketRotateAxis(moveType, normal) {
    return moveType.includes('ALONG')? 
    [-normal[0], -normal[1], -normal[2]]:
    [normal[0], normal[1], normal[2]]
}

/**
 * @description 获得法向量经某种变换(指配准)后的变换
 * @param normal 法向量, eg.[0,0,1]
 * @param transform 设置好内置matrix的vtkMatrixBuilder
 */
function getTransformNormal(normal, transform) {
    let normalPoints = [
        0,
        0,
        0, // 原点
        normal[0],
        normal[1],
        normal[2], // normal
    ];
    transform.apply(normalPoints);
    return [
        normalPoints[3] - normalPoints[0],
        normalPoints[4] - normalPoints[1],
        normalPoints[5] - normalPoints[2],
    ];
}

/**
 * @description 获得旋转后的法向量方向
 * @param normal 法向量, eg.[0,0,1]
 * @param axis 旋转轴
 * @param angle 旋转角度(度)
 */
function getRotateNormal(normal, axis, angle) {
    let normalPoints = [
        0,
        0,
        0, // 原点
        normal[0],
        normal[1],
        normal[2], // normal
    ];
    vtkMatrixBuilder
        .buildFromDegree()
        .rotate(angle, axis)
        .apply(normalPoints);
    return [
        normalPoints[3] - normalPoints[0],
        normalPoints[4] - normalPoints[1],
        normalPoints[5] - normalPoints[2],
    ];
}

/**
 * @description 根据center, xNormal, yNormal, zNormal计算刚体配准变换矩阵
 * @param center 托槽中心点
 * @param xNormal 托槽左右法向量
 * @param yNormal 托槽上下法向量
 * @param zNormal 托槽前后法向量
 */
function calculateRigidBodyTransMatrix(center, xNormal, yNormal, zNormal,originCenter=[0,0,0]) {
    let originPoints = vtkPoints.newInstance(); // 原始点集
    originPoints.setData([
        originCenter[0]+1,
        originCenter[1]+0,
        originCenter[2]+0, // 上下-yNormal
        originCenter[0]+0,
        originCenter[1]+1,
        originCenter[2]+0, // 前后-zNormal
        originCenter[0]+0,
        originCenter[1]+0,
        originCenter[2]+1, // 左右-xNormal
        
    ]);
    let targetPoints = vtkPoints.newInstance(); // 目标点集

    targetPoints.setData([
        center[0] + yNormal[0],
        center[1] + yNormal[1],
        center[2] + yNormal[2],
        center[0] + zNormal[0],
        center[1] + zNormal[1],
        center[2] + zNormal[2],
        center[0] + xNormal[0],
        center[1] + xNormal[1],
        center[2] + xNormal[2],
    ]);

    // 根据点集计算转换矩阵
    const transform = vtkLandmarkTransform.newInstance();

    transform.setMode(Mode.RIGID_BODY); // 刚体配准(只允许平移+旋转)
    transform.setSourceLandmark(originPoints); // vtkPoints:3D源点集列表
    transform.setTargetLandmark(targetPoints); // vtkPoints:3D目标点集列表

    transform.update(); // 根据目标点集和源点集启动矩阵计算

    return transform.getMatrix(); // mat4矩阵,转换结果(4*4)(平移加旋转)
}

/**
 * @description 根据bracketPoints和toothPoints更新并返回参数 center, xNormal, yNormal, zNormal
 * @param bottomFaceIndexList 托槽底面面片索引
 * @param bottom40PointIndexList 托槽底面40点索引
 * @param toothPointValues 牙齿点集 typedArray
 * @param bracketPointValues 托槽点集 typedArray
 * @param bracketCellValues 托槽面片组成 typedArray
 * @param actorMatrix 定义托槽中心+角度 (托槽点集中心\托槽左右法向量\托槽上下法向量\托槽前后法向量)
 * 其中的3个托槽法向量直接作为托槽移动轴
 * @param moveType 移动类型 上|下|左|右|逆时针|顺时针
 * @param moveStep 移动步长
 */
function updateBracketDataByLandMark(
    bottomFaceIndexList,
    bracketBottomPointValues,
    toothPointValues,
    bracketPointValues,
    bracketCellValues,
    actorMatrix,
    moveType,
    moveStep
) {
    // let t
    // let t0 = Date.now()
    // ------------------------------------------------------------------------
    // 复制参数(深拷贝)
    // ------------------------------------------------------------------------
    let transBracketPointValues = new Float32Array(bracketPointValues);
    let transBracketBottomPointValues = new Float32Array(
        bracketBottomPointValues
    );

    let { center, xNormal, yNormal, zNormal } = actorMatrix;
    // 托槽点集中心+3轴
    let transCenter = [...center];
    let transXNormal = [...xNormal];
    let transYNormal = [...yNormal];
    let transZNormal = [...zNormal];

    // 构造转换工具
    let vtkMatrixTransTool = vtkMatrixBuilder.buildFromDegree();

    // ------------------------------------------------------------------------
    // 初始读入的托槽位置为(0,0,0),需通过变换移到指定位置
    // ------------------------------------------------------------------------
    const initTransformMat = calculateRigidBodyTransMatrix(
        transCenter,
        transXNormal,
        transYNormal,
        transZNormal,
    );
    // 对托槽点集应用变换
    vtkMatrixTransTool
        .setMatrix(initTransformMat)
        .apply(transBracketPointValues)
        .apply(transBracketBottomPointValues);

    // ------------------------------------------------------------------------
    // 计算平移或旋转转换后的目标坐标
    // ------------------------------------------------------------------------

    if (["UP", "DOWN", "LEFT", "RIGHT"].indexOf(moveType) !== -1) {
        // 根据上下左右移动轴平移
        let translate = calculateBracketMoveDist(
            moveType,
            moveStep,
            transXNormal,
            transYNormal
        );
        // 更新center
        transCenter = [
            transCenter[0] + translate[0],
            transCenter[1] + translate[1],
            transCenter[2] + translate[2],
        ];
        // 平移时或许越界(根据当前点集中心和zNormal方向确定平移后是否越界)
        if (crossTheBorder(toothPointValues, transCenter, transZNormal)) {
            // 越界则直接返回
            return {
                isCrossTheBorder: true,
                transActorMatrix: {
                    transCenter: center, // center不变
                    transXNormal,
                    transYNormal,
                    transZNormal,
                },
            };
        }
        // 对点集应用平移
        pointsTranslateTransform(transBracketPointValues, translate);
    } else {
        let rotAxis;
        if(moveType=='ALONG'||moveType=='ANTI'){
            // 根据zNormal计算旋转轴(zNormal或-zNormal)
            rotAxis = getBracketRotateAxis(moveType, transZNormal);
            // 对点集应用旋转
            pointsRotTransform(
                transBracketPointValues,
                transCenter,
                rotAxis,
                moveStep
            );
            // actorMatrix的角度将随之发生变化(zNormal不变)
            transXNormal = getRotateNormal(transXNormal, rotAxis, moveStep);
            transYNormal = getRotateNormal(transYNormal, rotAxis, moveStep);
        }else if(moveType=='XALONG'||moveType=='XANTI'){
            rotAxis = getBracketRotateAxis(moveType, transXNormal);
            // 对点集应用旋转
            pointsRotTransform(
                transBracketPointValues,
                transCenter,
                rotAxis,
                moveStep
            );
            // actorMatrix的角度将随之发生变化(xNormal不变)
            transZNormal = getRotateNormal(transZNormal, rotAxis, moveStep);
            transYNormal = getRotateNormal(transYNormal, rotAxis, moveStep);
            return {
                isCrossTheBorder: false,
                transActorMatrix: {
                    transCenter, // center不变
                    transXNormal,
                    transYNormal,
                    transZNormal,
                },
            };
        }
    }
    // console.log('平移/旋转后', transCenter,transXNormal,transYNormal,transZNormal)
    // console.log('>>初始点集变换 + 平移/旋转后：', Date.now()-t)
    // t = Date.now()

    // ------------------------------------------------------------------------
    // 计算托槽底面到牙齿面的最佳贴合角度
    // ------------------------------------------------------------------------
    // 1、在转换后的托槽底面往牙齿方向延伸,构造一个大平面,在大平面的4条边上分别均匀取10个点
    // 2、遍历40个点,每个点都在牙齿点集中找出与之距离最近的点
    // 3、通过上述计算, 构造从托槽底面40点到牙齿面40点的刚体配准的矩阵(仅允许平移+旋转)
    // console.log('开始计算最佳贴合角度')
    // let t1 = Date.now()
    const mostFitTransform = getMostFitLandmarkTransform(
        transBracketBottomPointValues,
        toothPointValues,
        transBracketPointValues
    );
    // t1 = Date.now() - t1
    // console.log('>>计算最佳贴合角度：', Date.now()-t)
    // t = Date.now()

    // 4、对托槽点集应用刚体配准变换矩阵,即允许其进行二次平移和旋转,此时得到的托槽点集最贴合牙齿面(托槽的角度最贴合牙齿面)
    // console.log('开始应用刚体配准')
    const mostFitTransMat = mostFitTransform.getMatrix();
    // 转换矩阵设置
    vtkMatrixTransTool.setMatrix(mostFitTransMat);
    // 托槽点集转换
    vtkMatrixTransTool.apply(transBracketPointValues);
    // 转换后由于二次平移, 中心点会跟着变化, 但实质上这次平移是不希望的操作,后续会改回来的
    let landmarkedCenter = [transCenter[0], transCenter[1], transCenter[2]];
    vtkMatrixTransTool.apply(landmarkedCenter);

    // * 此处不再控制任何轴不变
    // 将对应托槽法向量进行相应旋转变换, 该配准所得到的角度将最贴合于牙齿面
    // xNormal(左右)根据配准产生的二次旋转进行相应变换
    transXNormal = getTransformNormal(transXNormal, vtkMatrixTransTool);
    // yNormal(上下)根据配准产生的二次旋转进行相应变换
    transYNormal = getTransformNormal(transYNormal, vtkMatrixTransTool);
    // zNormal(前后)根据配准产生的二次旋转进行相应变换
    transZNormal = getTransformNormal(transZNormal, vtkMatrixTransTool);

    // console.log('微调后的中心', landmarkedCenter)

    // 5、旋转调整, 将某个法向量旋转回配准前方向
    /**
         // console.log('调整刚体配准所造成的二次平移旋转')
         if (['UP', 'DOWN'].indexOf(moveType) !== -1) {
            // console.log('上下方向调整, 托槽沿yNormal方向(上下)移动, 需要保持xNormal方向(左右)不变')
            // 左右平移,我们要扳回xNormal到配准前方向, 其余两个直接应用此次配准旋转
            // xNormal(左右)不允许变化 -> xNormal配准后方向变成xlinsNormal
            let xlinsNormal = getTransformNormal(transXNormal, vtkMatrixTransTool)
            // yNormal(上下)根据配准产生的二次旋转进行相应变换
            transYNormal = getTransformNormal(transYNormal, vtkMatrixTransTool)
            // zNormal(前后)根据配准产生的二次旋转进行相应变换
            transZNormal = getTransformNormal(transZNormal, vtkMatrixTransTool)
            // 求出xNormal与xlinsNormal的角度并将托槽点集旋转回来
            // 夹角计算
            let xAngle = angleBetweenVectors(xlinsNormal, transXNormal) * 180 / Math.PI
            // 叉积(外积)计算,得到的方向正交于xNormal和xlinsNormal, 可作为旋转轴
            let rAxis = [0, 0, 0]
            cross(xlinsNormal, transXNormal, rAxis)
            // 旋转中心为配准后的托槽中心 landmarkedCenter
            // 托槽点集+yNormal+zNormal旋转
            // console.log('旋转回去', xAngle)
            pointsRotTransform(transBracketPoints, landmarkedCenter, rAxis, xAngle)
            transYNormal = getRotateNormal(transYNormal, rAxis, xAngle)
            transZNormal = getRotateNormal(transZNormal, rAxis, xAngle)
            // xNormal因为转回来了所以保持不变(可能会有极微小的变化)
            transXNormal = getRotateNormal(xlinsNormal, rAxis, xAngle)
        }
         else if (['LEFT', 'RIGHT'].indexOf(moveType) !== -1) {
            // console.log('左右方向调整, 沿xNormal方向移动, 保持yNormal不变')
            // 上下平移,我们要扳回yNormal到配准前方向, 其余两个直接应用此次配准旋转
            // xNormal(左右)根据配准产生的二次旋转进行相应变换
            transXNormal = getTransformNormal(transXNormal, vtkMatrixTransTool)
            // yNormal(上下)不允许变化 -> yNormal配准后方向变成ylinsNormal
            let ylinsNormal = getTransformNormal(transYNormal, vtkMatrixTransTool)
            // zNormal(前后)根据配准产生的二次旋转进行相应变换
            transZNormal = getTransformNormal(transZNormal, vtkMatrixTransTool)
            // 求出yNormal与ylinsNormal的角度并将托槽点集旋转回来
            // 夹角计算
            let yAngle = angleBetweenVectors(ylinsNormal, transYNormal) * 180 / Math.PI
            // 叉积(外积)计算,得到的方向正交于yNormal和ylinsNormal, 可作为旋转轴
            let rAxis = [0, 0, 0]
            cross(ylinsNormal, transYNormal, rAxis)
            // 旋转中心为配准后的托槽中心 landmarkedCenter
            // 托槽点集+xNormal+zNormal旋转
            // console.log('旋转回去', yAngle)
            pointsRotTransform(transBracketPoints, landmarkedCenter, rAxis, yAngle)
            transXNormal = getRotateNormal(transXNormal, rAxis, yAngle)
            transZNormal = getRotateNormal(transZNormal, rAxis, yAngle)
            // yNormal因为转回来了所以保持不变(可能会有极微小的变化)
            transYNormal = getRotateNormal(ylinsNormal, rAxis, yAngle)
        }
         else {
            // console.log('旋转调整, 沿zNormal轴旋转')
            // 顺逆时针旋转,我们要扳回zNormal到配准前方向, 其余两个直接应用此次配准旋转
            // xNormal(左右)根据配准产生的二次旋转进行相应变换
            transXNormal = getTransformNormal(transXNormal, vtkMatrixTransTool)
            // yNormal(上下)根据配准产生的二次旋转进行相应变换
            transYNormal = getTransformNormal(transYNormal, vtkMatrixTransTool)
            // zNormal(前后)不允许变化 -> zNormal配准后方向变成zlinsNormal
            let zlinsNormal = getTransformNormal(transZNormal, vtkMatrixTransTool)
            // 求出zNormal与zlinsNormal的角度并将托槽点集旋转回来
            // 夹角计算
            let zAngle = degreesFromRadians(angleBetweenVectors(zlinsNormal, transZNormal))
            // 叉积(外积)计算,得到的方向正交于zNormal和zlinsNormal, 可作为旋转轴
            let rAxis = [0, 0, 0]
            cross(zlinsNormal, transZNormal, rAxis)
            // 旋转中心为配准后的托槽中心 landmarkedCenter
            // 托槽点集+xNormal+yNormal旋转
            // console.log('旋转回去', zAngle)
            pointsRotTransform(transBracketPoints, landmarkedCenter, rAxis, zAngle)
            transXNormal = getRotateNormal(transXNormal, rAxis, zAngle)
            transYNormal = getRotateNormal(transYNormal, rAxis, zAngle)
            // zNormal因为转回来了所以保持不变(可能会有极微小的变化)
            transZNormal = getRotateNormal(zlinsNormal, rAxis, zAngle)
        }
         */

    // 6、平移调整：
    // transCenter：配准前托槽中心
    // landmarkedCenter: 配准后托槽中心
    // console.log('二次平移调整')
    let recoverCenterDist = [
        transCenter[0] - landmarkedCenter[0],
        transCenter[1] - landmarkedCenter[1],
        transCenter[2] - landmarkedCenter[2],
    ];
    // 平移到原来的位置
    pointsTranslateTransform(transBracketPointValues, recoverCenterDist);
    // console.log('>>刚体变换+二次平移旋转调整：', Date.now()-t)
    // t = Date.now()

    // * 平移到原来的位置意味着托槽将再次不贴合牙齿,也就是上述操作全部仅仅是为了调整托槽除了用户操作方向之外的两个法向量角度
    // * 找到最贴合牙齿平面的一个角度

    // ------------------------------------------------------------------------
    // 碰撞检测: 以一个小步长将托槽点集不断往牙齿方向(zNormal)平移,直至发现二者有交集(10点以上,视为碰撞), 此时停止
    // ------------------------------------------------------------------------
    // * 此过程中仅发生 平移 改变
    // * zNormal指向外侧, 托槽 沿zNormal方向移动远离牙齿, -zNormal方向移动贴近牙齿
    /**
         // 旧版距离检测为托槽点集与牙齿点集之间的距离计算,然而平缓的托槽底面可能只有几个面片组成, 即可能只有极少数点,
         // 且都分布在底部四周,而托槽底部点又是点集间距离计算的关键,我们要算的基本上可以概括为一个托槽底部上所有点到牙齿面点之间的对应距离
         // 因此失误而计算出的移动距离通常都会更大,因为这个距离其实是牙齿点到托槽其他部分(非底部)某一个点之间的距离,

         // let stepForPreventOverlap = calculateFirstStepDistAlongAxis(transBracketPoints, toothPoints, transZNormal)
         // console.log('防止碰撞检测前就重叠, 需向外平移', - stepForPreventOverlap)
         // let translateForPreventOverlap = [
         //     - stepForPreventOverlap * transZNormal[0],
         //     - stepForPreventOverlap * transZNormal[1],
         //     - stepForPreventOverlap * transZNormal[2],
         // ]
         //
         // pointsTranslateTransform(transBracketPoints, translateForPreventOverlap)
         // transCenter = [
         //     transCenter[0] + translateForPreventOverlap[0],
         //     transCenter[1] + translateForPreventOverlap[1],
         //     transCenter[2] + translateForPreventOverlap[2],
         // ]

         // * 如何判断托槽和牙齿是否有重合？ 设置一个容差为0.001, 如果两个点集中有任何一对点小于这个距离则说明它们重合
         // * 这需要双重循环双重遍历 + break(最大循环次数 maxIter = 牙齿点数 * 托槽点数)

         // * 方法：寻找托槽上每个点在牙齿上沿zNormal方向的对应点, 计算二点距离, 其中最短的就是我们要移动的距离
         // * (容差为0.001, 实际是对应子点集, 任取一点与对应托槽点构成的直线都足够平行于zNormal)
         // * <a>遍历托槽点集, 每个点沿zNormal方向构造一条直线, 每条直线都遍历牙齿点集找到与直线距离小于0.001的子点集,
         // * <b>其实对于一个三角坐标系来说, 我们需要找到的就是(x0,y0,z0)(x0,y0,z1)两点,
         // * (xNormal, yNormal, zNormal)是一个新坐标系,
         // * 托槽点在(xNormal, yNormal)与牙齿点在(xNormal, yNormal)上几乎相同就认为它们构成的直线与zNormal平行
         // * <a>每个牙齿点计算一个距离公式 <b>每个牙齿点计算复数个投影公式
         // * 设托槽点为m, 牙齿点为n, 平均小于容差的点集数为p
         // * <a>对托槽点分别设置一个最短距离, 构造直线, 遍历牙齿点, 如果点线距离小于容差, 则计算两个点的距离, 更新最短距离
         // * 共需 计算 m * n * 距离公式(7) + p * 1 次, 比较 m * n + p * 1 次
         // * <b>遍历托槽点计算2个transNormal(x,y)上的坐标, 遍历牙齿点计算2个transNormal(x,y)上的坐标
         // * 对托槽点分别设置一个最短距离, 遍历牙齿点, 如果 |xNormal之差| < 容差 并且 |yNormal之差| < 容差, 则计算并更新最短距离|zNormal之差|
         // * 共需 计算 m * 2 + n * 2 + m * n * 2 + p * 2(zNormal坐标) + p * 1(zNormal之差) 次, 比较 m * n * 2 + p * 1 次
         // * 采用<b>计算

         // * 注：需要考虑一种情况
         // console.log('碰撞检测')

         let minDistAlongZNormal = calculateMinDistAlongAxis(transBracketPoints, toothPoints, transXNormal, transYNormal, transZNormal, 0.1, 1)
         // 按上述距离移动能保证两个点集有一个点直接相交
         // 若crossDist取10, 则在托槽遇到牙齿像山顶一样的尖面(牙尖)时会发生移动过多的效果
         */

    // ------------------------------------------------------------------------
    // 新版碰撞检测：因为托槽底部面片少,点很稀疏,因此用双点集计算会有无法避免的误差存在,
    // 因此新版检测中将其改为牙齿各点与托槽面片(有界三角形平面)之间的距离检测,这种检测不存在上述误差
    // ------------------------------------------------------------------------
    // let t2 = Date.now()
    let minDistAlongZNormal = calculateMinDistBetweenFacesAndPointsAlongAxis(
        bottomFaceIndexList,
        transBracketPointValues,
        bracketCellValues,
        toothPointValues,
        transXNormal,
        transYNormal,
        transZNormal
    );
    // t2 = Date.now() - t2
    // console.log('计算得到, 牙齿需向内测平移', minDistAlongZNormal)

    // c++客户端的碰撞检测最后一步保证托槽-牙齿不贴合, 但是再移动0.2mm或者0.05mm就贴合了
    // 然后往里移动0.1mm, 保证能贴合
    // 我们这里实际上算出的距离基本上就是刚好贴合的状态, 没必要再继续往里移动了, 但根据视觉贴合, 往里再移0.05mm就可以
    // 由于打印误差,为在视觉上保持贴合,托槽再向里(zNormal)平移0.05mm
    minDistAlongZNormal += 0.05;

    let translateDistAlongZAxis = [
        -minDistAlongZNormal * transZNormal[0],
        -minDistAlongZNormal * transZNormal[1],
        -minDistAlongZNormal * transZNormal[2],
    ];

    // 托槽点集平移, 不需要继续操作, 现在要返回数据量
    // 中心点平移
    transCenter = [
        transCenter[0] + translateDistAlongZAxis[0],
        transCenter[1] + translateDistAlongZAxis[1],
        transCenter[2] + translateDistAlongZAxis[2],
    ];
    // console.log('最终位置', transCenter, transXNormal, transYNormal, transZNormal)

    // console.log('>>碰撞检测：', Date.now()-t)
    // t0 = Date.now() - t0
    // console.log(`40点/碰撞检测/总耗时: ${t1}/${t2}/${t0}`)
    return {
        isCrossTheBorder: false,
        transActorMatrix: {
            transCenter, // center不变
            transXNormal,
            transYNormal,
            transZNormal,
        },
    };
}

/**
 * @description 初始化加载完单托槽点集和单牙齿点集后需要进行一次贴合计算, 此步骤跳过平移和旋转微调, 直接计算最佳贴合角度, 并进行碰撞检测
 * 寻找初始位置的最佳贴合角度,返回值将确定托槽初始位置角度及后续微调的移动轴
 * @param bottomFaceIndexList 托槽底面面片索引
 * @param bracketBottomPointValues 托槽底面40点
 * @param toothPointValues 牙齿点集 typedArray
 * @param bracketPointValues 托槽点集 typedArray
 * @param bracketCellValues 托槽面片组成 typedArray
 * @param center 托槽中心点
 * @param xNormal 托槽左右法向量
 * @param yNormal 托槽上下法向量
 * @param zNormal 托槽前后法向量
 * @return  返回 { center, xNormal, yNormal, zNormal }, 该值将同时作为 actorNormal 和 moveNormal 的初始值
 */
function initBracketDataByLandMark(
    bottomFaceIndexList,
    bracketBottomPointValues,
    toothPointValues,
    bracketPointValues,
    bracketCellValues,
    center,
    xNormal,
    yNormal,
    zNormal,
) {
    // ------------------------------------------------------------------------
    // 复制参数 (构造深拷贝)
    // ------------------------------------------------------------------------
    let transBracketPointValues = new Float32Array(bracketPointValues);
    let transBracketBottomPointValues = new Float32Array(
        bracketBottomPointValues
    );

    let transCenter = [center[0], center[1], center[2]];
    let transXNormal = [xNormal[0], xNormal[1], xNormal[2]];
    let transYNormal = [yNormal[0], yNormal[1], yNormal[2]];
    let transZNormal = [zNormal[0], zNormal[1], zNormal[2]];

    // 构造转换工具
    let vtkMatrixTransTool = vtkMatrixBuilder.buildFromDegree();

    // ------------------------------------------------------------------------
    // 初始读入的托槽位置为(0,0,0),需通过变换移到指定位置
    // ------------------------------------------------------------------------
    const initTransformMat = calculateRigidBodyTransMatrix(
        transCenter,
        transXNormal,
        transYNormal,
        transZNormal,
    );
    // 对托槽点集应用变换
    vtkMatrixTransTool
        .setMatrix(initTransformMat)
        .apply(transBracketPointValues)
        .apply(transBracketBottomPointValues);

    // 注意初始读入时可能托槽嵌入牙齿里，这时计算贴合点是有问题的，因为可能托槽底面点最近的牙齿点会在牙后面或者一些奇怪的地方
    // 所以init时先做一次zNormal投影把它移出来，然后再贴合
    let minDistAlongZNormalAtInit = calculateMinDistBetweenFacesAndPointsAlongAxis(
        bottomFaceIndexList,
        transBracketPointValues,
        bracketCellValues,
        toothPointValues,
        transXNormal,
        transYNormal,
        transZNormal
    );

    // c++客户端的碰撞检测最后一步保证托槽-牙齿不贴合, 但是再移动0.2mm或者0.05mm就贴合了
    // 然后往里移动0.1mm, 保证能贴合
    // 我们这里实际上算出的距离基本上就是刚好贴合的状态, 没必要再继续往里移动了, 但根据视觉贴合, 往里再移0.05mm就可以

    // 由于打印误差,为在视觉上保持贴合,托槽再向里(zNormal)平移0.05mm
    minDistAlongZNormalAtInit += 0.05;

    let translateDistAlongZAxis = [
        -minDistAlongZNormalAtInit * transZNormal[0],
        -minDistAlongZNormalAtInit * transZNormal[1],
        -minDistAlongZNormalAtInit * transZNormal[2],
    ];


    // 托槽点集平移, 不需要继续操作, 现在要返回数据量
    // 中心点平移
    transCenter = [
        transCenter[0] + translateDistAlongZAxis[0],
        transCenter[1] + translateDistAlongZAxis[1],
        transCenter[2] + translateDistAlongZAxis[2],
    ];

    // 初始不改变角度, 仅仅把托槽往外平移
    return {
        center: transCenter,
        xNormal: transXNormal,
        yNormal: transYNormal,
        zNormal: transZNormal,
    };

    // vtkMatrixBuilder
    //     .buildFromDegree()
    //     .translate(
    //         -minDistAlongZNormalAtInit * transZNormal[0],
    //         -minDistAlongZNormalAtInit * transZNormal[1],
    //         -minDistAlongZNormalAtInit * transZNormal[2]
    //     )
    //     .apply(transBracketPointValues)
    //     .apply(transBracketBottomPointValues)
    //     .apply(transCenter);

    // // ------------------------------------------------------------------------
    // // 计算托槽底面到牙齿面的最佳贴合角度
    // // ------------------------------------------------------------------------
    // // 1、在转换后的托槽底面往牙齿方向延伸,构造一个大平面,在大平面的4条边上分别均匀取10个点
    // // 2、遍历40个点,每个点都在牙齿点集中找出与之距离最近的点
    // // 3、通过上述计算, 构造从托槽底面40点到牙齿面40点的刚体配准的矩阵(仅允许平移+旋转)
    // const mostFitTransform = getMostFitLandmarkTransform(
    //     transBracketBottomPointValues,
    //     toothPointValues,
    //     transBracketPointValues
    // );
    // // 4、对托槽点集应用刚体配准变换矩阵,即允许其进行二次平移和旋转,此时得到的托槽点集最贴合牙齿面(托槽的角度最贴合牙齿面)
    // const mostFitTransMat = mostFitTransform.getMatrix();

    // // 转换矩阵设置
    // vtkMatrixTransTool.setMatrix(mostFitTransMat);
    // // 托槽点集转换
    // vtkMatrixTransTool.apply(transBracketPointValues);
    // // 转换后由于二次平移, 中心点会跟着变化, 但实质上这次平移是不希望的操作,后续会改回来的
    // let landmarkedCenter = [transCenter[0], transCenter[1], transCenter[2]];
    // vtkMatrixTransTool.apply(landmarkedCenter);
    // // 此处允许三个移动轴同时变化
    // // xNormal(左右)根据配准产生的二次旋转进行相应变换
    // transXNormal = getTransformNormal(transXNormal, vtkMatrixTransTool);
    // // yNormal(上下)根据配准产生的二次旋转进行相应变换
    // transYNormal = getTransformNormal(transYNormal, vtkMatrixTransTool);
    // // zNormal(前后)根据配准产生的二次旋转进行相应变换
    // transZNormal = getTransformNormal(transZNormal, vtkMatrixTransTool);

    // // * 此时，认定上述3个法向量决定的托槽方向为微调后托槽最能贴合牙齿表面的方向
    // // 6、平移调整：
    // // transCenter：配准前托槽中心
    // // landmarkedCenter: 配准后托槽中心
    // // console.log('二次平移调整')
    // let recoverCenterDist = [
    //     transCenter[0] - landmarkedCenter[0],
    //     transCenter[1] - landmarkedCenter[1],
    //     transCenter[2] - landmarkedCenter[2],
    // ];
    // // 平移到原来的位置
    // pointsTranslateTransform(transBracketPointValues, recoverCenterDist);
    // // * 平移到原来的位置意味着托槽将再次不贴合牙齿,也就是上述操作全部仅仅是为了调整托槽除了用户操作方向之外的两个法向量角度
    // // * 找到最贴合牙齿平面的一个角度

    // // ------------------------------------------------------------------------
    // // 碰撞检测: 以一个小步长将托槽点集不断往牙齿方向(zNormal)平移,直至发现二者有交集(10点以上,视为碰撞), 此时停止
    // // ------------------------------------------------------------------------
    // // * 此过程中仅发生 平移 改变
    // // * zNormal指向外侧, 托槽 沿zNormal方向移动远离牙齿, -zNormal方向移动贴近牙齿

    // /**
    //  // 旧版距离检测为托槽点集与牙齿点集之间的距离计算,然而平缓的托槽底面可能只有几个面片组成, 即可能只有极少数点,
    //  // 且都分布在底部四周,而托槽底部点又是点集间距离计算的关键,我们要算的基本上可以概括为一个托槽底部上所有点到牙齿面点之间的对应距离
    //  // 因此失误而计算出的移动距离通常都会更大,因为这个距离其实是牙齿点到托槽其他部分(非底部)某一个点之间的距离,
    //  // * 如何判断托槽和牙齿是否有重合？ 设置一个容差为0.001, 如果两个点集中有任何一对点小于这个距离则说明它们重合
    //  // * 这需要双重循环双重遍历 + break(最大循环次数 maxIter = 牙齿点数 * 托槽点数)

    //  // * 方法：寻找托槽上每个点在牙齿上沿zNormal方向的对应点, 计算二点距离, 其中最短的就是我们要移动的距离
    //  // * (容差为0.001, 实际是对应子点集, 任取一点与对应托槽点构成的直线都足够平行于zNormal)
    //  // * <a>遍历托槽点集, 每个点沿zNormal方向构造一条直线, 每条直线都遍历牙齿点集找到与直线距离小于0.001的子点集,
    //  // * <b>其实对于一个三角坐标系来说, 我们需要找到的就是(x0,y0,z0)(x0,y0,z1)两点,
    //  // * (xNormal, yNormal, zNormal)是一个新坐标系,
    //  // * 托槽点在(xNormal, yNormal)与牙齿点在(xNormal, yNormal)上几乎相同就认为它们构成的直线与zNormal平行
    //  // * <a>每个牙齿点计算一个距离公式 <b>每个牙齿点计算复数个投影公式
    //  // * 设托槽点为m, 牙齿点为n, 平均小于容差的点集数为p
    //  // * <a>对托槽点分别设置一个最短距离, 构造直线, 遍历牙齿点, 如果点线距离小于容差, 则计算两个点的距离, 更新最短距离
    //  // * 共需 计算 m * n * 距离公式(7) + p * 1 次, 比较 m * n + p * 1 次
    //  // * <b>遍历托槽点计算2个transNormal(x,y)上的坐标, 遍历牙齿点计算2个transNormal(x,y)上的坐标
    //  // * 对托槽点分别设置一个最短距离, 遍历牙齿点, 如果 |xNormal之差| < 容差 并且 |yNormal之差| < 容差, 则计算并更新最短距离|zNormal之差|
    //  // * 共需 计算 m * 2 + n * 2 + m * n * 2 + p * 2(zNormal坐标) + p * 1(zNormal之差) 次, 比较 m * n * 2 + p * 1 次
    //  // * 采用<b>计算
    //  // * 注：需要考虑一种情况
    //  // let minDistAlongZNormal = calculateMinDistAlongAxis(transBracketPoints, toothPoints, transXNormal, transYNormal, transZNormal, 0.1, 1)
    //  */

    // // ------------------------------------------------------------------------
    // // 新版碰撞检测：因为托槽底部面片少,点很稀疏,因此用双点集计算会有无法避免的误差存在,
    // // 因此新版检测中将其改为牙齿各点与托槽面片(有界三角形平面)之间的距离检测,这种检测不存在上述误差
    // // ------------------------------------------------------------------------
    // let minDistAlongZNormal = calculateMinDistBetweenFacesAndPointsAlongAxis(
    //     bottomFaceIndexList,
    //     transBracketPointValues,
    //     bracketCellValues,
    //     toothPointValues,
    //     transXNormal,
    //     transYNormal,
    //     transZNormal
    // );

    // // 按上述距离移动能保证两个点集有一个点直接相交

    // // 若crossDist取10, 则在托槽遇到牙齿像山顶一样的尖面(牙尖)时会发生移动过多的效果
    // // 由于打印误差,为在视觉上保持贴合,托槽再向里(zNormal)平移0.1mm
    // minDistAlongZNormal += 0.1;

    // // // 调试用
    // // minDistAlongZNormal -= 1

    // let translateDistAlongZAxis = [
    //     -minDistAlongZNormal * transZNormal[0],
    //     -minDistAlongZNormal * transZNormal[1],
    //     -minDistAlongZNormal * transZNormal[2],
    // ];

    // // 托槽点集平移, 不需要继续操作, 现在要返回数据量
    // // 中心点平移
    // transCenter = [
    //     transCenter[0] + translateDistAlongZAxis[0],
    //     transCenter[1] + translateDistAlongZAxis[1],
    //     transCenter[2] + translateDistAlongZAxis[2],
    // ];

    // return {
    //     center: transCenter,
    //     xNormal: transXNormal,
    //     yNormal: transYNormal,
    //     zNormal: transZNormal,
    // };
}

export {
    calculateRigidBodyTransMatrix,
    updateBracketDataByLandMark,
    initBracketDataByLandMark,
    projectToAxis,
    estimateBracketBottomSlope,
};
