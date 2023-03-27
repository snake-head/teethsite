import { dot2D } from "@kitware/vtk.js/Common/Core/Math";
import { typedBracketNameList } from "../static_config";
import vtkMatrixBuilder from "@kitware/vtk.js/Common/Core/MatrixBuilder";

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
 * @param pointA (xA, yA)
 * @param pointB (xB, yB)
 * @param pointC (xC, yC)
 * @param pointP (xP, yP)
 */
function isInTriangle(pointA, pointB, pointC, pointP) {
    let AB = [pointB[0] - pointA[0], pointB[1] - pointA[1]];
    let AC = [pointC[0] - pointA[0], pointC[1] - pointA[1]];
    let AP = [pointP[0] - pointA[0], pointP[1] - pointA[1]];
    let d0 = dot2D(AP, AB);
    let d1 = dot2D(AB, AB);
    let d2 = dot2D(AB, AC);
    let d3 = dot2D(AP, AC);
    let d4 = dot2D(AC, AC);

    let inverDeno = 1 / (d1 * d4 - d2 * d2);
    let u = (d0 * d4 - d2 * d3) * inverDeno;
    if (u < 0 || u > 1) {
        // u不满足时直接返回
        return false;
    }
    let v = (d1 * d3 - d0 * d2) * inverDeno;
    if (v < 0 || v > 1) {
        // v不满足时直接返回
        return false;
    }
    if (u + v > 1) {
        return false;
    } else {
        return { u, v };
    }
}
function isInTriangleY(pointA, pointB, pointC, pointP) {
    let AB = [pointB[0] - pointA[0], pointB[2] - pointA[2]];
    let AC = [pointC[0] - pointA[0], pointC[2] - pointA[2]];
    let AP = [pointP[0] - pointA[0], pointP[2] - pointA[2]];
    let d0 = dot2D(AP, AB);
    let d1 = dot2D(AB, AB);
    let d2 = dot2D(AB, AC);
    let d3 = dot2D(AP, AC);
    let d4 = dot2D(AC, AC);

    let inverDeno = 1 / (d1 * d4 - d2 * d2);
    let u = (d0 * d4 - d2 * d3) * inverDeno;
    if (u < 0 || u > 1) {
        // u不满足时直接返回
        return false;
    }
    let v = (d1 * d3 - d0 * d2) * inverDeno;
    if (v < 0 || v > 1) {
        // v不满足时直接返回
        return false;
    }
    if (u + v > 1) {
        return false;
    } else {
        return { u, v };
    }
}
/**
 * @description 计算某一点沿某一方向延伸直线与一三角形有界平面的交点之间的距离
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
 * @param ret u,v
 * @return 返回距离,如果该点在三角形上没有投影则返回正无穷Infinity
 */
function pointDistanceWithPlaneAlongAxisByRet(
    pointA,
    pointB,
    pointC,
    pointP,
    ret
) {
    const { u, v } = ret;
    // 注 此时的crossPoint应该x和y是和p对上的, 只要计算z就够了
    const zCrossPoint =
        pointA[2] + u * (pointB[2] - pointA[2]) + v * (pointC[2] - pointA[2]); // P = A + AP = A + (u*AB + v*AC)
    return zCrossPoint - pointP[2];
}
function pointDistanceWithPlaneAlongAxisByRetY(
    pointA,
    pointB,
    pointC,
    pointP,
    ret
) {
    const { u, v } = ret;
    const yCrossPoint =
        pointA[1] + u * (pointB[1] - pointA[1]) + v * (pointC[1] - pointA[1]); // P = A + AP = A + (u*AB + v*AC)
    return yCrossPoint - pointP[1];
}

/**
 * @description 计算上下咬合移动的距离, 上颌牙面片对下颌牙点
 * 注意pointDistanceWithPlaneAlongAxis沿z轴方向计算距离, 或许需要一定转换
 * @param toothPointsDatas 牙齿点, upper lower, 其中以牙齿名称作为key
 * @param toothFacesDatas 牙齿面片组成, upper, 其中以牙齿名称作为key
 * @param transMatrix 转换牙齿点到标准坐标系
 */
function computeTeethAutoBiteDistanceZ(
    toothPointsDatas,
    toothFacesDatas,
    transMatrix
) {
    // console.time('转换耗时')
    // 构造下颌牙点集
    let numOfLowerToothPoints = 0;
    for (let toothName in toothPointsDatas) {
        if (typedBracketNameList.lower.includes(toothName)) {
            numOfLowerToothPoints += toothPointsDatas[toothName].length / 3;
        }
    }
    let pointsOfLowerTeeth = new Array(numOfLowerToothPoints),
        toothPointValues,
        pOffset = 0,
        arrLength;
    for (let toothName in toothPointsDatas) {
        if (typedBracketNameList.lower.includes(toothName)) {
            // ------------------------------------------------------------------------
            // 复制参数 (构造深拷贝)
            // ------------------------------------------------------------------------
            toothPointValues = toothPointsDatas[toothName];
            // 对牙齿点集应用变换
            vtkMatrixBuilder
                .buildFromDegree()
                .setMatrix(transMatrix[toothName])
                .apply(toothPointValues);
            arrLength = toothPointValues.length;
            for (
                let idxStart = 0, idxEnd = 3;
                idxStart < arrLength;
                idxStart += 3, idxEnd += 3
            ) {
                pointsOfLowerTeeth[pOffset++] = toothPointValues.subarray(
                    idxStart,
                    idxEnd
                );
            }
        }
    }
    // console.timeEnd('转换耗时') // 7

    // 计算下颌牙边界框
    let xminL = Infinity,
        yminL = Infinity,
        xmaxL = -Infinity,
        ymaxL = -Infinity;
    pointsOfLowerTeeth.forEach(([x, y, z]) => {
        if (xminL > x) {
            xminL = x;
        }
        if (xmaxL < x) {
            xmaxL = x;
        }
        if (yminL > y) {
            yminL = y;
        }
        if (ymaxL < y) {
            ymaxL = y;
        }
    });

    // console.time('构造面片耗时')
    // 构造上颌牙面片, 并计算面片的边界框
    // 计算上颌牙全面片数, 并预分配内存给facesOfUpperTeeth
    let numOfFaces = 0;
    for (let toothName in toothFacesDatas) {
        if (typedBracketNameList.upper.includes(toothName)) {
            numOfFaces += toothFacesDatas[toothName].length / 4;
        }
    }
    let facesOfUpperTeeth = new Array(numOfFaces),
        fbArrayOffset = 0,
        faceValues,
        point1Offset,
        point2Offset,
        point3Offset,
        point1,
        point2,
        point3;
    for (let toothName in toothFacesDatas) {
        if (typedBracketNameList.upper.includes(toothName)) {
            // 对牙齿点集应用变换
            toothPointValues = toothPointsDatas[toothName];
            vtkMatrixBuilder
                .buildFromDegree()
                .setMatrix(transMatrix[toothName])
                .apply(toothPointValues);
            // 读取面片构造
            faceValues = toothFacesDatas[toothName];
            console.log(faceValues)
            numOfFaces = faceValues.length / 4;
            for (let fbOffset = 0; fbOffset < numOfFaces; fbOffset++) {
                point1Offset = faceValues[fbOffset + 1] * 3;
                point2Offset = faceValues[fbOffset + 2] * 3;
                point3Offset = faceValues[fbOffset + 3] * 3;
                point1 = toothPointValues.subarray(
                    point1Offset,
                    point1Offset + 3
                );
                point2 = toothPointValues.subarray(
                    point2Offset,
                    point2Offset + 3
                );
                point3 = toothPointValues.subarray(
                    point3Offset,
                    point3Offset + 3
                );
                facesOfUpperTeeth[fbArrayOffset++] = {
                    point1,
                    point2,
                    point3,
                    xmin: Math.min(point1[0], point2[0], point3[0]),
                    xmax: Math.max(point1[0], point2[0], point3[0]),
                    ymin: Math.min(point1[1], point2[1], point3[1]),
                    ymax: Math.max(point1[1], point2[1], point3[1]),
                };
            }
        }
    }
    // console.timeEnd('构造面片耗时') // 70
    // 计算上颌牙边界框
    let xminU = Infinity,
        yminU = Infinity,
        xmaxU = -Infinity,
        ymaxU = -Infinity;
    facesOfUpperTeeth.forEach(({ xmin, xmax, ymin, ymax }) => {
        if (xminU > xmin) {
            xminU = xmin;
        }
        if (xmaxU < xmax) {
            xmaxU = xmax;
        }
        if (yminU > ymin) {
            yminU = ymin;
        }
        if (ymaxU < ymax) {
            ymaxU = ymax;
        }
    });
    // 计算重合边界框
    let xminUL = Math.max(xminL, xminU),
        yminUL = Math.max(yminL, yminU),
        xmaxUL = Math.min(xmaxL, xmaxU),
        ymaxUL = Math.min(ymaxL, ymaxU);
    // 筛选
    pointsOfLowerTeeth = pointsOfLowerTeeth.filter(
        (val) =>
            val[0] > xminUL &&
            val[0] < xmaxUL &&
            val[1] > yminUL &&
            val[1] < ymaxUL
    );
    facesOfUpperTeeth = facesOfUpperTeeth.filter(
        ({ xmin, xmax, ymin, ymax }) =>
            Math.max(xmin, xminUL) < Math.min(xmax, xmaxUL) &&
            Math.max(ymin, yminUL) < Math.min(ymax, ymaxUL)
    );
    if (pointsOfLowerTeeth.length === 0 || facesOfUpperTeeth.length === 0) {
        return null;
    }

    // console.time('排序耗时')
    // 根据面片的x和y边界框筛选出对应点, 筛选过程为双循环, 可以简化
    // 上颌牙面片根据xmin排序, 下颌牙点根据x坐标进行排序
    facesOfUpperTeeth.sort((a, b) => a.xmin - b.xmin);
    pointsOfLowerTeeth.sort((a, b) => a[0] - b[0]);
    // console.timeEnd('排序耗时') // 43

    // 双重循环, 找出每个面片边界框内的点, 框外一定不重合, 不需要参与计算, 找到的点直接用于计算面片和点之间的距离, 寻找距离最小值
    // console.time('计算咬合移动距离耗时')
    let upperFaceslength = facesOfUpperTeeth.length,
        lowerPointslength = pointsOfLowerTeeth.length,
        filterPointsPart,
        dist,
        xRangeLower = 0, // 循环下界
        xRangeUpper = 0, // 循环上界
        minDist = Infinity, // 最短距离
        isInFace = false,
        notFoundDist = true;
    // let t = [0, 0, 0], t1
    for (let upperIdx = 0; upperIdx < upperFaceslength; upperIdx++) {
        let {
            point1,
            point2,
            point3,
            xmin,
            xmax,
            ymin,
            ymax,
        } = facesOfUpperTeeth[upperIdx];
        // t1 = Date.now()
        // 更新下界
        for (
            let lowerIdx = xRangeLower;
            lowerIdx < lowerPointslength;
            lowerIdx++
        ) {
            if (pointsOfLowerTeeth[lowerIdx][0] > xmin) {
                xRangeLower = lowerIdx;
                break;
            }
        }
        // 更新上界
        for (
            let lowerIdx = xRangeLower;
            lowerIdx < lowerPointslength;
            lowerIdx++
        ) {
            if (pointsOfLowerTeeth[lowerIdx][0] > xmax) {
                xRangeUpper = lowerIdx;
                break;
            }
            if (lowerIdx === lowerPointslength - 1) {
                xRangeUpper = lowerPointslength;
            }
        }
        // t[0] += (Date.now() - t1) // 500
        // t1 = Date.now()
        // 循环更新距离
        filterPointsPart = pointsOfLowerTeeth
            .slice(xRangeLower, xRangeUpper) // 筛选x坐标
            .filter((val) => val[1] > ymin && val[1] < ymax) // 筛选y坐标
            .sort((a, b) => b[2] - a[2]); // 计算z距离, 我们其实可以把这部分点先根据z从大到小进行排序, 然后只要遍历到有一个点在面片内部, 那它一定能产生最小距离

        // t[1] += (Date.now() - t1) // 700
        // t1 = Date.now()
        // 计算这些xy坐标在面片边界框之内的点, 计算它们沿z轴的距离
        for (let val of filterPointsPart) {
            isInFace = isInTriangle(point1, point2, point3, val);
            if (isInFace) {
                dist = pointDistanceWithPlaneAlongAxisByRet(
                    point1,
                    point2,
                    point3,
                    val,
                    isInFace
                );
                if (dist < minDist) {
                    minDist = dist;
                    notFoundDist = false;
                }
                break;
            }
        }
        // t[2] += (Date.now() - t1) // 100
    }
    // console.timeEnd('计算咬合移动距离耗时') // 2400
    // console.log(`咬合距离: ${minDist}`)
    // console.log('分别耗时', t)

    if (notFoundDist) {
        return null;
    }

    // 即在这种转换下, 我们需要让上颌牙朝下颌牙(下颌牙朝上颌牙)方向移动平移minDist, 从而使双颌咬合
    return minDist;
}
function computeTeethAutoBiteDistanceY(
    toothPointsDatas,
    toothFacesDatas,
    transMatrix
) {
    // console.time('转换耗时')
    // 构造下颌牙点集
    let numOfLowerToothPoints = 0;
    for (let toothName in toothPointsDatas) {
        if (typedBracketNameList.lower.includes(toothName)) {
            numOfLowerToothPoints += toothPointsDatas[toothName].length / 3;
        }
    }
    let pointsOfLowerTeeth = new Array(numOfLowerToothPoints);
    let toothPointValues,
        pOffset = 0,
        arrLength;
    for (let toothName in toothPointsDatas) {
        if (typedBracketNameList.lower.includes(toothName)) {
            // ------------------------------------------------------------------------
            // 复制参数 (构造深拷贝)
            // ------------------------------------------------------------------------
            toothPointValues = toothPointsDatas[toothName];
            // 对牙齿点集应用变换
            vtkMatrixBuilder
                .buildFromDegree()
                .setMatrix(transMatrix[toothName])
                .apply(toothPointValues);
            arrLength = toothPointValues.length;
            for (
                let idxStart = 0, idxEnd = 3;
                idxStart < arrLength;
                idxStart += 3, idxEnd += 3
            ) {
                pointsOfLowerTeeth[pOffset++] = toothPointValues.subarray(
                    idxStart,
                    idxEnd
                );
            }
        }
    }
    // console.timeEnd('转换耗时') // 7

    // 计算下颌牙边界框
    let xminL = Infinity,
        zminL = Infinity,
        xmaxL = -Infinity,
        zmaxL = -Infinity;
    pointsOfLowerTeeth.forEach(([x, y, z]) => {
        if (xminL > x) {
            xminL = x;
        }
        if (xmaxL < x) {
            xmaxL = x;
        }
        if (zminL > z) {
            zminL = z;
        }
        if (zmaxL < z) {
            zmaxL = z;
        }
    });

    // console.time('构造面片耗时')
    // 构造上颌牙面片, 并计算面片的边界框
    // 计算上颌牙全面片数, 并预分配内存给facesOfUpperTeeth
    let numOfFaces = 0;
    for (let toothName in toothFacesDatas) {
        if (typedBracketNameList.upper.includes(toothName)) {
            numOfFaces += toothFacesDatas[toothName].length / 4;
        }
    }
    let facesOfUpperTeeth = new Array(numOfFaces),
        fbArrayOffset = 0,
        faceValues,
        point1Offset,
        point2Offset,
        point3Offset,
        point1,
        point2,
        point3;
    for (let toothName in toothFacesDatas) {
        if (typedBracketNameList.upper.includes(toothName)) {
            // 对牙齿点集应用变换
            toothPointValues = toothPointsDatas[toothName];
            vtkMatrixBuilder
                .buildFromDegree()
                .setMatrix(transMatrix[toothName])
                .apply(toothPointValues);
            // 读取面片构造
            faceValues = toothFacesDatas[toothName];
            numOfFaces = faceValues.length / 4;
            for (let fbOffset = 0; fbOffset < numOfFaces; fbOffset++) {
                point1Offset = faceValues[fbOffset + 1] * 3;
                point2Offset = faceValues[fbOffset + 2] * 3;
                point3Offset = faceValues[fbOffset + 3] * 3;
                point1 = toothPointValues.subarray(
                    point1Offset,
                    point1Offset + 3
                );
                point2 = toothPointValues.subarray(
                    point2Offset,
                    point2Offset + 3
                );
                point3 = toothPointValues.subarray(
                    point3Offset,
                    point3Offset + 3
                );
                facesOfUpperTeeth[fbArrayOffset++] = {
                    point1,
                    point2,
                    point3,
                    xmin: Math.min(point1[0], point2[0], point3[0]),
                    xmax: Math.max(point1[0], point2[0], point3[0]),
                    zmin: Math.min(point1[2], point2[2], point3[2]),
                    zmax: Math.max(point1[2], point2[2], point3[2]),
                };
            }
        }
    }
    // console.timeEnd('构造面片耗时') // 70
    // 计算上颌牙边界框
    let xminU = Infinity,
        zminU = Infinity,
        xmaxU = -Infinity,
        zmaxU = -Infinity;
    facesOfUpperTeeth.forEach(({ xmin, xmax, zmin, zmax }) => {
        if (xminU > xmin) {
            xminU = xmin;
        }
        if (xmaxU < xmax) {
            xmaxU = xmax;
        }
        if (zminU > zmin) {
            zminU = zmin;
        }
        if (zmaxU < zmax) {
            zmaxU = zmax;
        }
    });
    // 计算重合边界框
    let xminUL = Math.max(xminL, xminU),
        zminUL = Math.max(zminL, zminU),
        xmaxUL = Math.min(xmaxL, xmaxU),
        zmaxUL = Math.min(zmaxL, zmaxU);
    // 筛选
    pointsOfLowerTeeth = pointsOfLowerTeeth.filter(
        (val) =>
            val[0] > xminUL &&
            val[0] < xmaxUL &&
            val[1] > zminUL &&
            val[1] < zmaxUL
    );
    facesOfUpperTeeth = facesOfUpperTeeth.filter(
        ({ xmin, xmax, zmin, zmax }) =>
            Math.max(xmin, xminUL) < Math.min(xmax, xmaxUL) &&
            Math.max(zmin, zminUL) < Math.min(zmax, zmaxUL)
    );
    if (pointsOfLowerTeeth.length === 0 || facesOfUpperTeeth.length === 0) {
        return null;
    }

    // console.time('排序耗时')
    // 根据面片的x和y边界框筛选出对应点, 筛选过程为双循环, 可以简化
    // 上颌牙面片根据xmin排序, 下颌牙点根据x坐标进行排序
    facesOfUpperTeeth.sort((a, b) => a.xmin - b.xmin);
    pointsOfLowerTeeth.sort((a, b) => a[0] - b[0]);
    // console.timeEnd('排序耗时') // 43

    // 双重循环, 找出每个面片边界框内的点, 框外一定不重合, 不需要参与计算, 找到的点直接用于计算面片和点之间的距离, 寻找距离最小值
    // 注意此时经检验, y正向指向后方(屏幕里测)
    // console.time('计算咬合移动距离耗时')
    let upperFaceslength = facesOfUpperTeeth.length,
        lowerPointslength = pointsOfLowerTeeth.length,
        filterPointsPart,
        dist,
        xRangeLower = 0, // 循环下界
        xRangeUpper = 0, // 循环上界
        minDist = -Infinity, // 移动最短距离
        isInFace = false,
        notFoundDist = true;
    // let t = [0, 0, 0], t1
    for (let upperIdx = 0; upperIdx < upperFaceslength; upperIdx++) {
        let {
            point1,
            point2,
            point3,
            xmin,
            xmax,
            zmin,
            zmax,
        } = facesOfUpperTeeth[upperIdx];
        // t1 = Date.now()
        // 更新下界
        for (
            let lowerIdx = xRangeLower;
            lowerIdx < lowerPointslength;
            lowerIdx++
        ) {
            if (pointsOfLowerTeeth[lowerIdx][0] > xmin) {
                xRangeLower = lowerIdx;
                break;
            }
        }
        // 更新上界
        for (
            let lowerIdx = xRangeLower;
            lowerIdx < lowerPointslength;
            lowerIdx++
        ) {
            if (pointsOfLowerTeeth[lowerIdx][0] > xmax) {
                xRangeUpper = lowerIdx;
                break;
            }
            if (lowerIdx === lowerPointslength - 1) {
                xRangeUpper = lowerPointslength;
            }
        }
        // t[0] += (Date.now() - t1) // 500
        // t1 = Date.now()
        // 循环更新距离
        filterPointsPart = pointsOfLowerTeeth
            .slice(xRangeLower, xRangeUpper) // 筛选x坐标
            .filter((val) => val[2] > zmin && val[2] < zmax) // 筛选z坐标
            .sort((a, b) => a[1] - b[1]); // 计算y距离, 我们其实可以把这部分点先根据y从小到小进行排序, 然后只要遍历到有一个点在面片内部, 那它一定能产生最小距离

        // t[1] += (Date.now() - t1) // 700
        // t1 = Date.now()
        // 计算这些xy坐标在面片边界框之内的点, 计算它们沿z轴的距离
        for (let val of filterPointsPart) {
            isInFace = isInTriangleY(point1, point2, point3, val);
            if (isInFace) {
                dist = pointDistanceWithPlaneAlongAxisByRetY(
                    point1,
                    point2,
                    point3,
                    val,
                    isInFace
                );
                if (dist > minDist) {
                    minDist = dist;
                    notFoundDist = false;
                }
                break;
            }
        }
        // t[2] += (Date.now() - t1) // 100
    }
    // console.timeEnd('计算咬合移动距离耗时') // 2400
    // console.log(`咬合距离: ${minDist}`)
    // console.log('分别耗时', t)
    if (notFoundDist) {
        return null;
    }

    return minDist;
}

self.onmessage = function(event) {
    const { biteType, teethType } = event.data;
    switch (biteType) {
        case "autoBiteZ": {
            const {
                toothPointsDatas,
                toothFacesDatas,
                transMatrix,
            } = event.data;
            const centerTranslate = computeTeethAutoBiteDistanceZ(
                toothPointsDatas,
                toothFacesDatas,
                transMatrix
            );
            self.postMessage({ biteType, teethType, centerTranslate });
            break;
        }
        case "autoBiteY": {
            const {
                toothPointsDatas,
                toothFacesDatas,
                transMatrix,
            } = event.data;
            const centerTranslate = computeTeethAutoBiteDistanceY(
                toothPointsDatas,
                toothFacesDatas,
                transMatrix
            );
            self.postMessage({ biteType, teethType, centerTranslate });
            break;
        }
    }
};
