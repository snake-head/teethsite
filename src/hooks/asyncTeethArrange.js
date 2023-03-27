import { reactive, toRaw, computed } from "vue";
import { useStore } from "vuex";
import vtkPolyData from "@kitware/vtk.js/Common/DataModel/PolyData";
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";
import TeethArrangeWorker from "./teethArrange.worker";
import { distance2BetweenPoints } from "@kitware/vtk.js/Common/Core/Math";
import reDesignVtkAxesActor from "../reDesignVtk/reDesignVtkAxesActor";
import { colorConfig as actorColorConfig } from "./actorControl";
/**
 * 托槽法向量定义:
 * xNormal 左右法向量(+x上颌牙指向左侧/下颌牙指向右侧)
 * yNormal 上下法向量(+y指向牙尖startCoor/上颌牙指向下侧/下颌牙指向上侧)
 * zNormal 前后法向量(+z指向托槽脱离牙齿方向的外侧)
 *
 * 对于一个牙尖朝上摆放的牙齿, 它的xNormal指向右侧, yNormal指向上侧, zNormal指向牙齿->托槽的同向侧
 *
 * 对于一个展示在屏幕中的完整牙齿(上颌牙+下颌牙), 分别的从左->右的排列顺序为:
 * 上颌牙: UR7 UR6 UR5 UR4 UR3 UR2 UR1 UL1 UL2 UL3 UL4 UL5 UL6 UL7
 * 下颌牙: LR7 LR6 LR5 LR4 LR3 LR2 LR1 LL1 LL2 LL3 LL4 LL5 LL6 LL7
 * 牙齿坐标系定义:
 * +x: 由L7牙指向R7牙, 与托槽xNormal类似定义, 既指向屏幕左侧, 上颌牙呈锐角, 下颌牙呈钝角
 * +y: 从牙齿内部指向牙齿外侧, 由L7R7连线中点指向L1R1连线中点, 与托槽zNormal类似定义, 且方向呈锐角
 * +z: 上方向, 指向牙尖(上颌牙朝下, 下颌牙朝上), 与托槽yNormal类似定义, 且方向呈锐角
 * 注：牙齿坐标系由牙齿原始数据(分割数据)构建, 托槽微调不影响该坐标系的方向
 * 从上往下看(俯视),二者牙齿坐标系的xy平面应该是
 * +x ← o
 *      ↓
 *      +y
 * 牙弓线做出来是一个下半圆(如y=1-x^2)
 *
 * 对于屏幕中的上颌牙: 它的坐标系 +x指向左侧, +y指向前侧, +z指向下侧
 * 对于屏幕中的下颌牙: 它的坐标系 +x指向左侧, +y指向前侧, +z指向上侧
 *
 * 使用的是全单牙齿点集+托槽点集
 * 在计算牙弓线前,首先转换坐标系, 让牙齿坐标系替代原坐标系, 然后一般不看z轴(排整齐的牙齿托槽z相同),只关心x,y轴, 相当于把上下颌牙投影到xOy平面进行牙弓线计算
 * 托槽、牙齿点集、对应长轴点、对应中心、对应法向量都刚体变换到牙齿坐标系, 且此后的行为都发生在牙齿坐标系
 * 在经过转换之后, 对于每个牙齿坐标(1,0,0)(0,1,0)(0,0,1)就是它的三个正方向
 * 最后再转换回来
 */
/**
 * 最小二乘法推导
 * 假设有多项式 y = a0 + a1x + a2x^2 + a3x^3 + ... + akx^k
 * 让这个多项式去拟合n个坐标点(x1,y1),(x2,y2), ..., (xn,yn), 且
 * 则可列出方程组:
 * y1 =  a0 + a1x1 + a2x1^2 + a3x1^3 + ... + akx1^k
 * ...
 * yn =  a0 + a1xn + a2xn^2 + a3xn^3 + ... + akxn^k
 * 假设n个方程非齐次, 准确的说组成的秩z大于k+1, 则方程组不可解的超越方程
 * 最小二乘法的目标是偏差平方和最小, 即
 *                  n
 * f(a0,a1,...ak) = ∑ [ (a0 + a1xi + a2xi^2 + a3xi^3 + ... + akxi^k) - yi ]^2
 *                 i=1
 * 当f取最小值时,求出的a0, ..., ak这组参数即为拟合最好的多项式直线
 *
 * 最小二乘法求解过程:
 * (1) f会有最小值, 则取到最小值时的各一阶导数为0, 可列出方程组:
 *          n
 * ∂f/∂a0 = ∑ 2[ (a0 + a1xi + a2xi^2 + a3xi^3 + ... + akxi^k) - yi ] = 0
 *         i=1
 *
 *          n
 * ∂f/∂a1 = ∑ 2[ (a0 + a1xi + a2xi^2 + a3xi^3 + ... + akxi^k) - yi ]xi = 0
 *         i=1
 *
 *          n
 * ∂f/∂a2 = ∑ 2[ (a0 + a1xi + a2xi^2 + a3xi^3 + ... + akxi^k) - yi ]xi^2 = 0
 *         i=1
 * ...
 *          n
 * ∂f/∂ak = ∑ 2[ (a0 + a1xi + a2xi^2 + a3xi^3 + ... + akxi^k) - yi ]xi^k = 0
 *         i=1
 *
 * (2) 化简得
 *  n                                                 n
 *  ∑ (a0 + a1xi + a2xi^2 + a3xi^3 + ... + akxi^k) =  ∑ yi
 * i=1                                               i=1
 *
 *  n                                                         n
 *  ∑ (a0xi + a1xi^2 + a2xi^3 + a3xi^4 + ... + akxi^(k+1)) =  ∑ yixi
 * i=1                                                       i=1
 * ...
 *  n                                                                       n
 *  ∑ (a0xi^k + a1xi^(k+1) + a2xi^(k+2) + a3xi^(k+3) + ... + akxi^(k+k)) =  ∑ yixi^k
 * i=1                                                                     i=1
 *
 * (3) 展开
 *              n              n              n                    n             n
 *  na0     + a1∑ xi       + a2∑ xi^2     + a3∑ xi^3     + ... + ak∑ xi^k     =  ∑ yi
 *             i=1            i=1            i=1                  i=1           i=1
 *
 *   n          n              n              n                    n             n
 * a0∑ xi   + a1∑ xi^2     + a2∑ xi^3     + a3∑ xi^4     + ... + ak∑ xi^(k+1) =  ∑ yixi
 *  i=1        i=1            i=1            i=1                  i=1           i=1
 * ...
 *   n          n              n              n                    n             n
 * a0∑ xi^k + a1∑ xi^(k+1) + a2∑ xi^(k+2) + a3∑ xi^(k+3) + ... + ak∑ xi^(2k)  =  ∑ yixi^k
 *  i=1        i=1            i=1            i=1                  i=1           i=1
 *
 * (4) 写成矩阵形式
 * |   n     ∑ xi        ∑ xi^2      ∑ xi^3      ...  ∑ xi^k     |    | a0  |        | ∑ yi     |
 * | ∑ xi    ∑ xi^2      ∑ xi^3      ∑ xi^4      ...  ∑ xi^(k+1) |    | a1  |        | ∑ yixi   |
 * | ∑ xi^2  ∑ xi^3      ∑ xi^4      ∑ xi^5      ...  ∑ xi^(k+2) |    | a2  |   =    | ∑ yixi^2 |
 * |   ...                                                       |    | ... |        | ...      |
 * | ∑ xi^k  ∑ xi^(k+1)  ∑ xi^(k+2)  ∑ xi^(k+3)  ...  ∑ xi^(2k)  |    | ak  |        | ∑ yixi^k |
 *
 * (5) 求解方程
 *
 * ----------------------------------------------------------------------------------------------------
 * 而求解最小二乘法还有一种分析思路, 这也使函数vtkMath.solveLeastSquares所遵循的方法
 * 依旧是让 y = a0 + a1x + a2x^2 + a3x^3 + ... + akx^k 去拟合n个坐标点(x1,y1),(x2,y2), ..., (xn,yn)
 * 则我们一般的思路就是列出n个方程去进行求解:
 * a0 + a1x1 + a2x1^2 + a3x1^3 + ... + akx1^k = y1
 * a0 + a1x2 + a2x2^2 + a3x2^3 + ... + akx2^k = y2
 * ...
 * a0 + a1xn + a2xn^2 + a3xn^3 + ... + akxn^k = yn
 * 该方程秩大于k+1时不可解
 * 但该方程若写成矩阵形式, 其实有一种解决思路, 称为伪逆法
 * | 1  x1  x1^2  x1^3  ...  x1^k | | a0  |   | y1  |
 * | 1  x2  x2^2  x2^3  ...  x2^k | | a1  |   | y2  |
 * | 1  x3  x3^2  x3^3  ...  x3^k | | a2  | = | y3  |
 * | ...                          | | ... |   | ... |
 * | 1  xn  xn^2  xn^3  ...  xn^k | | ak  |   | yk  |
 * 写作 Ax = b
 * 则有 A'Ax = A'b --> A'A为 (k+1,k+1) 矩阵, 当A'A满足满秩的情况下, 可以求逆, 即可直接解得
 * x = (A'A)^-1A'b
 * 其实你会发现, A'A其实结果和上面的导数矩阵是一样的, 非满秩时未知数多于方程数不可解
 *
 * 函数：  vtkMath.solveLeastSquares(
 *          numberOfSamples: number, 14, 需要让该多项式拟合多少点
 *          xt: number[], 即X, 二维数组, eg.[[1,2,3],[4,5,6], dims:[numberOfSamples, xOrder]
 *          xOrder: number, x的秩, 5
 *          yt: number[], 即Y, 二维数组, eg.[[1,2,3],[4,5,6], dims:[numberOfSamples, yOrder]
 *          yOrder: number, y的秩, 1
 *          mt: number[], 即M, 二维数组, eg.[[1,2,3],[4,5,6], dims:[xOrder, yOrder], 输出结果参数
 *          checkHomogeneous: boolean
 *      )
 * 函数说明: 求解方程 XM = Y 的最小二乘最佳拟合矩阵, 使用伪逆法求解, t:转置
 * 注: mt需要预先分配好对应空间 [0, 0, 0, 0, 0] 用于输出参数的写入
 * xOrder和yOrder需小于numberOfSamples, 否则提示点的选取不够并返回 0
 * 如果X的维度是14*5, Y的维度是14*1, 则M的维度为5*1, numberOfSamples=14, xOrder=5, yOrder=1
 * 流程：以1e-12为界, 小于该值为0
 * 伪逆法: 由于X通常不是一个正方形矩阵,所以X不能直接求逆矩阵X^(-1), 所以XM = Y通常不能直接求为M=(X)^(-1)Y
 * 因此需要变式,两边同乘转置矩阵:
 * XM = Y -> XtXM = XtY -> M = (XtX)^(-1)XtY
 * 其中, XtX的维度为 [xOrder, xOrder], 可以求逆(满秩)
 * 且XtX是对称矩阵:
 * XtX[i][j] = Xt的i行  与 X的j列 累加
 *           = X的i列 与 X的j列 累加
 *           = X[0][i]*X[0][j] + X[1][i]*X[1][j] + ... + X[n][i]*X[n][j]
 * XtX[j][i] = Xt的j行  与 X的i列 累加
 *           = X的j列 与 X的i列 累加
 *           = X[0][j]*X[0][i] + X[1][j]*X[1][i] + ... + X[n][j]*X[n][i]
 *           = XtX[i][j]
 * 该方法实际上只负责伪逆法求解方程, 我们需要先计算出累加形式的Xt和Yt的具体值, 再使用该方法
 */
/**
 * 最后计算出牙弓线(4次多项式)排牙时, 以L1和R1的locationCoor的连线中点fixP为初始x值, 计算出其在牙弓线上的点, 为startP
 * 然后向左右两侧牙齿延伸, 定位出每个托槽中心在牙弓线上的位置点
 * 我们需要计算出每颗牙齿在托槽xNormal方向的投影宽度,
 * 1、首先对L1,R1, 将它们的托槽中心定位在startP向两侧的一半投影宽度处, 注意这里的一半宽度指的是牙弓线曲线段长度, 因此涉及定积分计算
 * 但牙弓线为4次多项式无法计算定积分, 因此用一段段微分直线段长度来近似曲线长度
 * 如果finxP的x=1.0, 距离width=9.5, 可以计算[-8.5~1.0]之间的曲线(在该段长度下的曲线段长度必定大于9.5), 每隔0.01距离的小长度来近似积分
 * 注：可以先全部算好, 再直接找出最近的距离
 * 计算出2个托槽中心对应的牙弓线点后, 进行对应刚体变换(切向,径向,(0,0,1)), 得到两颗牙齿点集,
 * 进行首次碰撞检测, 使两颗牙齿刚好不重叠
 * 对于后续其他牙齿, 每次沿牙弓线移动单颗牙齿整个投影宽度的距离进行定位, 在碰撞检测, 解决掉重叠或者空隙的问题,
 * 让每两颗牙齿刚好碰在一起
 */
/**
 * 碰撞检测：排好两颗门牙后, 计算两颗牙齿是否碰撞, 如果有, 则两颗牙齿同时向+x,-x远离移动相同距离,
 * 如果没有, 则沿x方向靠近移动相同距离, 以小步长迭代,
 * 每次移动都是按x加减后计算出牙弓线点, 再进行一次对应的刚体变换, 再进行碰撞检测,
 * 对其它牙齿的碰撞检测都是固定住排好的, 只移动一个牙齿
 *
 * 由于此处对托槽的yNormal(上下指向)都设置相同, 因此对于某一个牙齿, 沿x轴寻找到另一个的对应点,只要求z相同的话,都是一样的
 * 可以在排两颗牙之前先构造好这种对应关系
 * 然后每一层z制造出差值距离, 再取最小差值minSubDist, 大于0有空隙,要靠近, 小于0有重叠,要远离
 * 对于R牙, 远离方向是+x, 靠近方向是-x
 * 对于L牙, 远离方向是-x, 靠近方向是+x
 * 而minSubDist即是x坐标之差,
 * 当 minSubDist > 0, 有空隙, 靠近, xR-minSubDist || xL+minSubDist || xR-minSubDist/2, xL+minSubDist/2
 * 当 minSubDist < 0, 有重叠, 远离, xR-minSubDist || xL+minSubDist || xR-minSubDist/2, xL+minSubDist/2
 * 终止条件定位 |minSubDist| < 0.1
 *
 * 想象两颗牙齿, 初步排牙后, 如果有重叠, 则移动|minSubDist|, (门牙/2双向移动)
 * 在计算minSubDist的过程中可以只注意记录每一个z层在xOy平面上的边界点(怎么算?)
 *
 * 循环迭代: 每次如果是单颗牙就移动minSubDist, 如果是双牙就各移动 minSubDist/2, 移完再计算minSubDist, 再移动, 直至其绝对值小于0.1
 *
 * 如何让初始值就使minSubDist尽可能小? 初始位置为上一个确定点往左或往右沿切线方向移动两颗牙齿各一半的宽度, 这就作为迭代初始 x
 *
 */

export default function(allActorList) {
	const store = useStore();
	const arrangeProgress = store.state.userHandleState.arrangeState;
	const teethStandardAxis = store.state.actorHandleState.teethArrange.teethStandardAxis;
	const dentalArchSettings = store.state.actorHandleState.teethArrange.dentalArchSettings;
	const dentalArchAdjustSettings = store.state.actorHandleState.teethArrange.dentalArchAdjustRecord;
	const arrangeTeethType = computed(() => store.getters["userHandleState/arrangeTeethType"]);
	const bracketNameList = store.state.userHandleState.bracketNameList;
	const isBracketDataMatchTeethType = computed(() => store.getters["userHandleState/isBracketDataMatchTeethType"]);

	let preFineTuneRecord = {
		upper: {},
		lower: {},
	}; // 记录上一次排牙时的微调结果, 如果没发生变化则不需要重新计算
	// let arrangeMatrixList = {
	//     // 保存的矩阵为 托槽从当前牙齿上的位置(fineTuneRecord)到牙弓线位置(worker)的变换矩阵
	// };
	// let teethStandardAxis = {
	//     // 把生成的牙齿标准坐标系搞出来, 包括center加3轴
	//     // xnormal左右L7->R7,ynormal前后指向门牙,znormal上下指向牙尖,center
	//     upper: {},
	//     lower: {},
	// };

	let worker = {
		upper: null,
		lower: null,
	};

	let originCellsDataList = {
		upper: { tooth: {}, bracket: {} },
		lower: { tooth: {}, bracket: {} },
	}; // 用于第5步actor生成

	/**
	 * @description 记录当前微调信息
	 * @param teethType upper | lower
	 * @param currFineTuneRecord 当次托槽微调信息
	 */
	function updateFineTuneRecord(teethType, currFineTuneRecord) {
		Object.keys(currFineTuneRecord).forEach((toothName) => {
			const { center, xNormal, yNormal, zNormal } = currFineTuneRecord[toothName];
			// 初始化
			preFineTuneRecord[teethType][toothName] = {};
			// 更新数据
			preFineTuneRecord[teethType][toothName].center = [...center];
			preFineTuneRecord[teethType][toothName].xNormal = [...xNormal];
			preFineTuneRecord[teethType][toothName].yNormal = [...yNormal];
			preFineTuneRecord[teethType][toothName].zNormal = [...zNormal];
		});
		return preFineTuneRecord;
	}

	/**
	 * @description 根据子线程返回数据, 构造牙弓线actor
	 * @param teethType upper | lower
	 * @param originData 源cells数据
	 * @param arrangedData 排牙数据(子线程返回)
	 */
	function generateArchActor(teethType, originData, arrangedData) {
		// 生成牙弓线actor
		const {
			arch: { archPointsData, archCellsData },
		} = arrangedData;
		const archPolyData = vtkPolyData.newInstance();
		archPolyData.getPoints().setData(archPointsData);
		archPolyData.getPolys().setData(archCellsData);
		// const archActor = vtkActor.newInstance();
		// const archMapper = vtkMapper.newInstance();
		// archMapper.setInputData(archPolyData);
		// archActor.setMapper(archMapper);
		if (allActorList[teethType].arch.actor) {
			// 之前生成过则此次仅替换输入
			allActorList[teethType].arch.mapper.setInputData(archPolyData);
		} else {
			// 首次生成
			const archActor = vtkActor.newInstance();
			archActor.getProperty().setColor(actorColorConfig.bracket.active);
			const archMapper = vtkMapper.newInstance();
			archActor.setMapper(archMapper);
			archMapper.setInputData(archPolyData);
			allActorList[teethType].arch = {
				actor: archActor,
				mapper: archMapper,
			};
		}
	}

	/**
	 * @description 在排牙完成后构造牙齿标准坐标系
	 * @param teethType 上颌牙/下颌牙
	 * @param toothPolyDatas 牙齿polydata, 主要用于计算它们距离中心点的最大距离
	 * 由于标准坐标系可确定, 单齿分割数据也确定, 因此该actor生成可以在初始化中完成
	 * 该函数仅执行一次即可
	 */
	function generateTeethAxisSphereActor(teethType, toothPolyDatas) {
		if (!allActorList[teethType].teethAxisSphere.actor) {
			// 未建立actor时才创建
			const { center } = teethStandardAxis[teethType];

			let axisLength = 0.0,
				numPoints;
			for (let name of Object.keys(toothPolyDatas)) {
				if (bracketNameList[teethType].includes(name)) {
					numPoints = toothPolyDatas[name].length;
					for (let idx = 0; idx < numPoints; idx += 3) {
						const point = [
							toothPolyDatas[name][idx],
							toothPolyDatas[name][idx + 1],
							toothPolyDatas[name][idx + 2],
						];
						axisLength = Math.max(axisLength, distance2BetweenPoints(center, point));
					}
				}
			}
			// 构造坐标轴actor(mapper已经在函数中设置好了)
			const axesActor = reDesignVtkAxesActor.newInstance({
				config: {
					tipResolution: 10,
					tipRadius: 0.4,
					tipLength: 0.03,
					shaftResolution: 10,
					shaftRadius: 0.1,
					invert: false,
					withCircumCircle: true,
				},
				xAxisColor: [205, 50, 50],
				yAxisColor: [50, 205, 50],
				zAxisColor: [50, 50, 205],
				axisLength: Math.sqrt(axisLength) * 2,
			});
			allActorList[teethType].teethAxisSphere = { actor: axesActor };
		}
	}

	/**
	 * @description 开启排牙子线程
	 */
	function initArrangeWorker() {
		// 提前开好模拟排牙用多线程, 并传递数据, 让其提前开好LR子线程
		for (let teethType of arrangeTeethType.value) {
			// ------------------------------------------------------------------------
			// 创建线程
			// ------------------------------------------------------------------------
			worker[teethType] = new TeethArrangeWorker();
			worker[teethType].postMessage({ step: -1 });
		}
	}

	/**
	 * @description 销毁子线程
	 */
	function terminateArrangeWorker() {
		for (let teethType of arrangeTeethType.value) {
			worker[teethType].postMessage({ step: 100 }); // 销毁孙子线程
			worker[teethType].terminate();
		}
	}

	/**
	 * @description 给子线程传递初始数据, 该函数只进行一次, 后续会变动的数据只有托槽数据
	 * 住一次出包括局部文件变量originCellsDataList的读入
	 * @param segPolyDatas {tooth:{ UL1, ..., LL1,... }, bracket:{ UL1, ..., LL1,... }}
	 * @param longAxisData { UL1, ..., LL1,... }
	 * @param teethAxis { center, xNormal, yNormal, zNormal }
	 */
	function postInitialDataToWorker(segPolyDatas, longAxisData) {
		// ------------------------------------------------------------------------
		// 把数据分成上颌牙和下颌牙两部分
		// ------------------------------------------------------------------------
		// 注-有一种特殊的错误情况, 即我们的上颌牙和下颌牙数据存反了, 此时应该继续支持排牙, 一种合理的方式就是基于fineTunedBracketData的key
		// 在3个输入数据中, 只有fineTunedBracketData是分上下颌牙存的, 因此以它为基准, 看里面上颌牙和下颌牙的toothName,
		// 对应读取其它两个数据
		for (let teethType of arrangeTeethType.value) {
			// ------------------------------------------------------------------------
			// 创建线程
			// ------------------------------------------------------------------------
			worker[teethType] = new TeethArrangeWorker();
			// let filterStartKey = teethType === "upper" ? "U" : "L";
			let targetTeethType = isBracketDataMatchTeethType.value
				? teethType
				: teethType === "upper"
				? "lower"
				: "upper";
			// 注意上下颌牙相反的情况
			let postData = {
				step: "Init",
				teethType: targetTeethType,
				segPolyDatas: {
					tooth: {},
					bracket: {},
				},
				longAxisData: {},
			};
			let toothNameList = Object.keys(longAxisData).filter((n) => bracketNameList[teethType].includes(n));
			for (let toothName of toothNameList) {
				for (let typeKey of ["tooth", "bracket"]) {
					postData.segPolyDatas[typeKey][toothName] = segPolyDatas[typeKey][toothName].getPoints().getData();
					originCellsDataList[teethType][typeKey][toothName] = segPolyDatas[typeKey][toothName]
						.getPolys()
						.getData();
				}
				postData.longAxisData[toothName] = longAxisData[toothName];
			}

			// 牙齿标准坐标系只需计算一次, 后续直接传入子线程做后续计算
			// 如果传入参数teethAxis则可以直接在此处记录, 否则等待子线程做计算然后传回数据
			let { center, xNormal, yNormal, zNormal } = toRaw(teethStandardAxis[teethType]);
			let { W, axisCoord, zLevelOfArch } = toRaw(dentalArchSettings[teethType]);
			if (center && xNormal && yNormal && zNormal) {
				// 传给子线程用于后续处理
				postData.teethAxis = {
					center,
					xNormal,
					yNormal,
					zNormal,
				};
				// 由于此时已有标准坐标系和单齿分割数据, 因此可以直接制造标准坐标系actor(咬合用)
				generateTeethAxisSphereActor(teethType, postData.segPolyDatas.tooth);
			}
			// 传给子线程用于后续处理, 没有时将自动在子线程中计算
			postData.dentalArchSettings = {
				W,
				axisCoord,
				zLevelOfArch,
			};

			// 接收worker子线程中的postMessage数据
			worker[teethType].onmessage = function(event) {
				const { data } = event;
				switch (data.step) {
					case "Init":
						// 接收到初始数据, 做一定计算后返回结果, 包括牙齿标准坐标系和牙弓线设置
						// 如果初始数据有保存到服务器上, 子线程不会发这种东西
						if (data.teethAxis) {
							// 保存
							store.dispatch("actorHandleState/updateTeethStandardAxis", { [teethType]: data.teethAxis });
							// 初始化成teethAxis, 这里深拷贝也没什么问题, 因为很明确后续不会再变动了
							store.dispatch("actorHandleState/updateTeethAxisFinetuneRecord", {
								[teethType]: data.teethAxis,
							});
						}
						if (data.dentalArchSettings) {
							// 保存
							store.dispatch("actorHandleState/updateDentalArchSettings", {
								[teethType]: data.dentalArchSettings,
							});
						}
						// 计算
						generateTeethAxisSphereActor(teethType, postData.segPolyDatas.tooth);
						break;
					case 0:
						currentArrangeStep[teethType] = 1;
						worker[teethType].postMessage({
							step: 1,
						});
						break;
					case 1:
						currentArrangeStep[teethType] = 2;
						worker[teethType].postMessage({
							step: 2,
						});
						break;
					case 2:
						// 保存牙弓线参数
						store.dispatch("actorHandleState/updateDentalArchSettings", {
							[teethType]: data.dentalArchSettings,
						});
						currentArrangeStep[teethType] = 3;
						worker[teethType].postMessage({
							step: 3,
						});
						break;
					case 3:
						currentArrangeStep[teethType] = 4;
						store.dispatch("userHandleState/updateArrangeProgress", {
							[teethType]: { L: data.data.L, R: data.data.R },
						});
						worker[teethType].postMessage({
							step: 4,
							toothLoc: "L",
							finish: data.data.L.finish,
						});
						worker[teethType].postMessage({
							step: 4,
							toothLoc: "R",
							finish: data.data.R.finish,
						});
						break;

					case 4:
						store.dispatch("userHandleState/updateArrangeProgress", {
							[teethType]: {
								[data.data.toothLoc]: {
									finish: data.data.finish,
								},
							},
						});
						// 检查上颌牙是否排完
						if (
							arrangeProgress[teethType][data.data.toothLoc].finish ===
							arrangeProgress[teethType][data.data.toothLoc].total
						) {
							// 排完则检测是否LR都排完, 是则开始构造actor
							if (
								arrangeProgress[teethType].L.finish === arrangeProgress[teethType].L.total &&
								arrangeProgress[teethType].R.finish === arrangeProgress[teethType].R.total
							) {
								currentArrangeStep[teethType] = 5;
								worker[teethType].postMessage({
									step: 5,
								});
							}
						} else {
							// 未排完则继续
							worker[teethType].postMessage({
								step: 4,
								toothLoc: data.data.toothLoc,
								finish: data.data.finish,
							});
						}
						break;

					case 5:
						// 如果返回牙弓线则处理数据, 生成polyData, 制造牙弓线actor
						if (event.data.data.arch) {
							generateArchActor(teethType, originCellsDataList[teethType], event.data.data);
						}
						if (event.data.lockDentalArch) {
							// 更新记录矩阵
							store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
								[teethType]: {
									arrangeMatrix: event.data.arrangeMatrix,
								},
							});
						} else {
							// 更新转换矩阵(托槽牙齿位置->牙弓线位置)
							store.dispatch("actorHandleState/updateArrangeMatrix", event.data.arrangeMatrix);
						}

						// actor准备加入屏幕
						currentArrangeStep[teethType] = 6;
						break;
					case 6:
						// 发生于托槽信息无变化, 则根据现有actor直接渲染
						// actor准备加入屏幕
						currentArrangeStep[teethType] = 6;
						break;
					case "enterAtInitTime":
						// 假设初始化读入数据满足排牙条件, 则此处直接跳跃至这一步, 制造牙弓线数据并返回
						// 处理数据, 生成polyData, 制造牙弓线actor
						generateArchActor(teethType, originCellsDataList[teethType], event.data.data);
						// actor准备加入屏幕
						currentArrangeStep[teethType] = 6;
						break;
					case "reCalculateDentalArch":
						// 覆盖牙弓线参数
						store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
							[teethType]: {
								coEfficients: event.data.coEfficients,
							},
						});
						// 根据返回结果重新生成牙弓线
						generateArchActor(teethType, originCellsDataList[teethType], event.data);
						break;
					default:
						break;
				}
			};

			// 构造好数据后传递给对应子线程
			worker[teethType].postMessage(postData);
		}
	}
	let enterAtInitTime = computed(() => store.state.actorHandleState.teethArrange.enterAtInitTime);
	/**
	 * @description 开始排牙, 传入托槽位置
	 * @param fineTunedBracketData {upper:{UL1, ...}, lower:{LL1, ...}}
	 * @param reCalculateDentalArch 如果需要重新计算牙弓线, 则手动设置为true, 用于上面板的[初始化]
	 */
	function startTeethArrange(fineTunedBracketData, reCalculateDentalArch = false) {
		// 如果没有传fineTunedBracketData
		fineTunedBracketData = fineTunedBracketData ? fineTunedBracketData : preFineTuneRecord;
		let arrangeTeethType = Object.keys(fineTunedBracketData);
		for (let teethType of ["upper", "lower"]) {
			if (arrangeTeethType.includes(teethType)) {
				currentArrangeStep[teethType] = 1;
			} else {
				currentArrangeStep[teethType] = 6;
			}
		}

		// ------------------------------------------------------------------------
		// 把数据分成上颌牙和下颌牙两部分
		// ------------------------------------------------------------------------
		if (enterAtInitTime.value) {
			// 初次进入
			// 该分支只进入一次
			store.dispatch("actorHandleState/updateEnterAtInitTime", false);
			// 判断是否满足条件, 满足条件则直接跳过大部分排牙算法, 满足条件应该看数据是否齐全
			// 但根据上传的特性, 其实看coEfficients有没有就够了, 这个有其它一定有
			if (
				dentalArchSettings.upper.coEfficients !== null ||
				dentalArchSettings.lower.coEfficients !== null
			) {
				for (let teethType of arrangeTeethType) {
					// 给子线程传输数据, 子线程直接根据这些数据进行牙弓线计算并返回 onMessage中匹配
					worker[teethType].postMessage({
						step: "enterAtInitTime",
						coEfficients: toRaw(dentalArchSettings[teethType].coEfficients),
					});
					// 更新托槽位置信息
					updateFineTuneRecord(teethType, fineTunedBracketData[teethType]);
				}
			} else {
				// 正常排牙
				for (let teethType of arrangeTeethType) {
					// 给子线程传输数据, 开始排牙
					worker[teethType].postMessage({
						step: 0,
						preFineTuneRecord: preFineTuneRecord[teethType],
						fineTunedBracketData: fineTunedBracketData[teethType],
					});
					// 更新托槽位置信息
					updateFineTuneRecord(teethType, fineTunedBracketData[teethType]);
				}
			}
		} else {
			// 后续进入, 此时牙弓线必定已有参数
			for (let teethType of arrangeTeethType) {
				let coEfficients = toRaw(dentalArchSettings[teethType].coEfficients);
				if (coEfficients !== null && !reCalculateDentalArch) {
					// 触发: 左面板[更新]按钮
					// 有牙弓线参数, 并且不强制重新计算牙弓线
					// 锁定牙弓线排牙, 走特殊流程, 但此时和正常流程一样, 会更新托槽微调记录
					// 但多传参数isDentalArchLocked, coefficients, 具体可以看worker.js里怎么处理
					worker[teethType].postMessage({
						step: 0,
						preFineTuneRecord: preFineTuneRecord[teethType],
						fineTunedBracketData: fineTunedBracketData[teethType],
						isDentalArchLocked: true,
						coEfficients,
					});
					// 更新托槽位置信息
					updateFineTuneRecord(teethType, fineTunedBracketData[teethType]);
				} else if (reCalculateDentalArch) {
					// 触发: 上面板[牙弓线调整]-[初始化]按钮
					// 强制排牙, 不论是否有牙弓线参数, 都重新计算牙弓线 + 排牙
					worker[teethType].postMessage({
						step: 0,
						// preFineTuneRecord: preFineTuneRecord[teethType],
						// 不传preFineTunedRecord则里面会直接排牙
						fineTunedBracketData: fineTunedBracketData[teethType],
						// force: true, // 跳过检查微调记录是否变动, 必定进行排牙
					});
				}
				//  else {
				//     // 不锁定牙弓线参数, 并且此时没有牙弓线参数 -> 不可能有这种情况
				//     // 即根据当前微调结果重新计算牙弓线, 走正常流程
				//     // 给子线程传输数据, 开始排牙
				//     worker[teethType].postMessage({
				//         step: 0,
				//         preFineTuneRecord: preFineTuneRecord[teethType],
				//         fineTunedBracketData: fineTunedBracketData[teethType],
				//     });
				//     // 更新托槽位置信息
				//     updateFineTuneRecord(
				//         teethType,
				//         fineTunedBracketData[teethType]
				//     );
				// }
			}
		}
	}
	/**
	 * @description 根据牙弓线调整, 重新计算牙弓线
	 * @param teethType
	 * @param fineTunedBracketCenters {teethType:{{toothname1: {bracketMatrix: {center: [x1,y1,z1]}}, toothname2: {bracketMatrix: {center: [x2,y2,z2]}}, }}}
	 * @reset 本次为重置牙弓线操作, 此时即根据dentalArchSettings的coEfficients重新生成一次牙弓线, 实际操作同"enterAtInitTime"
	 */
	function reCalculateDentalArchCoefficients(teethType, fineTunedBracketCenters, reset = false, regenerate = false) {
		// {teethType:{{toothname1: {bracketMatrix: {center: [x1,y1,z1]}}, toothname2: {bracketMatrix: {center: [x2,y2,z2]}}, }}}
		if (reset) {
			currentArrangeStep[teethType] = 1;
			worker[teethType].postMessage({
				step: "enterAtInitTime",
				coEfficients: toRaw(dentalArchSettings[teethType].coEfficients),
			});
			return;
		}
		if (regenerate) {
			currentArrangeStep[teethType] = 1;
			worker[teethType].postMessage({
				step: "enterAtInitTime",
				coEfficients: toRaw(dentalArchAdjustSettings[teethType].coEfficients),
			});
			return;
		}
		// 给子线程传输数据, 开始排牙
		worker[teethType].postMessage({
			step: "recalculateDentalArch",
			data: fineTunedBracketCenters,
		});
	}

	/**
	 * @description 根据调整牙弓线排牙
	 * 触发: 上面板[牙弓线调整]-[更新]按钮
	 * @param teethType {String}
	 * @param coEfficients {Array}
	 * @param fineTunedBracketData {Object} 可以为 {UL1, ...} or {LL1, ...}
	 */
	function startTeethArrangeByAdjustedDentalArch(teethType, coEfficients, fineTunedBracketData) {
		currentArrangeStep[teethType] = 1;
		// 锁定牙弓线排牙, 走特殊流程, 但此时和正常流程一样, 会更新托槽微调记录
		// 但多传参数isDentalArchLocked, coefficients, 具体可以看worker.js里怎么处理
		// onmessage中最后一步不返回牙弓线, 只返回排牙矩阵, 并且不覆盖原来的数据
		worker[teethType].postMessage({
			step: 0,
			isDentalArchLocked: true, // 正常排牙不传参则默认设置为false
			coEfficients, // 调整后牙弓线参数
			fineTunedBracketData,
			// 不传preFineTunedRecord则里面会直接排牙
		});
	}

	let currentArrangeStep = reactive({
		upper: 0,
		lower: 0,
	});

	return {
		currentArrangeStep,
		initArrangeWorker,
		terminateArrangeWorker,
		postInitialDataToWorker,
		startTeethArrange,
		startTeethArrangeByAdjustedDentalArch,
		preFineTuneRecord,
		reCalculateDentalArchCoefficients,
	};
}
