import xml2js from "xml2js";
import { sendRequestWithToken } from "./tokenRequest";

/**
 * @description 传入的数据挂载到xml文件的指定地方, xml是对象, 直接挂载就行, 不用返回值
 * 目前上传的数据包括:
 * bracketData: 托槽位置(微调时改变)
 * longAxisData: 托槽长轴点(小球拖动, 影响坐标轴)
 * teethArrangeData: 排牙相关, 包括牙弓线参数、牙齿标准坐标系、托槽转换矩阵(排牙前位置->牙弓线位置)
 * teethAxisFinetuneRecord: 咬合位置调整的转换矩阵, 上下颌牙各一份
 * dentalArchAdjustRecord: 牙弓线调整小球的记录, 替换用于牙弓线计算的拟合点, 本来是各托槽中心(最多14个点),
 * 现在把其中最多3对/6个替换成可供用户自由调整的小球, 再加上1个控制y轴交点的小球, 一共最多15个拟合点(8托槽+7小球)
 *
 * 请对应修改dataLoadAndParse.worker.js中的parseArrangeData()
 * 和asyncDataLoadAndParse.js中的worker.onmessage的case 5
 */
function parseAndMountToData(xmlData, dataToMount) {
	const {
		bracketData,
		longAxisData,
		teethArrangeData,
		teethAxisFinetuneRecord,
		dentalArchAdjustRecord,
	} = dataToMount;
	// 根据新托槽信息更新xml数据
	xmlData.ProcessState[0].$.collisionState = 1 //只要上传就已经是经过碰撞检测，collisionState置1
	xmlData.PositionResult[0].Position.forEach((item) => {
		const filteredData = bracketData.filter((val) => val.name === item.$.name);
		const filterLongAxisData = longAxisData.filter((val) => val.name === item.$.name);
		if (filteredData.length > 0) {
			const { center, yNormal, zNormal } = filteredData[0];
			item.TcPosition[0].TcCenterCoor[0].$ = {
				Coor0: center[0].toString(),
				Coor1: center[1].toString(),
				Coor2: center[2].toString(),
			};
			item.TcPosition[0].TcCenterAxis[0].$ = {
				Coor0: yNormal[0].toString(),
				Coor1: yNormal[1].toString(),
				Coor2: yNormal[2].toString(),
			};
			item.TcPosition[0].TcNormal[0].$ = {
				Coor0: zNormal[0].toString(),
				Coor1: zNormal[1].toString(),
				Coor2: zNormal[2].toString(),
			};
		}
		if (filterLongAxisData.length > 0) {
			const { startCoor, endCoor } = filterLongAxisData[0];
			item.LongAxis[0].StartCoor[0].$ = {
				Coor0: startCoor[0].toString(),
				Coor1: startCoor[1].toString(),
				Coor2: startCoor[2].toString(),
			};
			item.LongAxis[0].EndCoor[0].$ = {
				Coor0: endCoor[0].toString(),
				Coor1: endCoor[1].toString(),
				Coor2: endCoor[2].toString(),
			};
		}
	});
	// 根据排牙信息更新xml数据
	Reflect.deleteProperty(xmlData, "dentalArch");
	xmlData.dentalArch = [{ $: { dentalarchtype: "1" } }];

	let {
		arrangeMatrix,
		dentalArchSettings: { W, axisCoord, zLevelOfArch, coEfficients },
		teethStandardAxis: { center, xNormal, yNormal, zNormal },
	} = teethArrangeData;

	// 存arrangeMatrix
	if (Object.keys(arrangeMatrix).length > 0) {
		xmlData.dentalArch[0].arrange = [];
		Object.entries(arrangeMatrix).forEach(([toothName, { center, xNormal, yNormal, zNormal }], index) => {
			xmlData.dentalArch[0].arrange[index] = {
				$: { name: toothName },
				transform: Object.fromEntries(
					[...center, ...xNormal, ...yNormal, ...zNormal].map((val, indexT) => [
						`transform${indexT}`,
						val.toString(),
					])
				),
			};
		});
	}
	// 存dentalArchSettings
	if (typeof W === "number" && typeof axisCoord === "number" && typeof zLevelOfArch === "number") {
		xmlData.dentalArch[0].W = [{ $: { W: W.toString() } }];
		xmlData.dentalArch[0].AxisCoor = [{ $: { AxisCoor: axisCoord.toString() } }];
		xmlData.dentalArch[0].Z = [{ $: { Z: zLevelOfArch.toString() } }];
	}
	if (coEfficients !== null) {
		xmlData.dentalArch[0].coefficient = [
			{
				$: Object.fromEntries(
					coEfficients.flat(1).map((val, index) => [`coefficient${index}`, val.toString()])
				),
			},
		];
	}
	// 存标准坐标系
	if (center !== null && xNormal !== null && yNormal !== null && zNormal !== null) {
		xmlData.dentalArch[0].transform = [
			{
				$: Object.fromEntries(
					[...center, ...xNormal, ...yNormal, ...zNormal].map((val, index) => [
						`transform${index}`,
						val.toString(),
					])
				),
			},
		];
	}
	// 存咬合调整的矩阵
	let {
		center: centerBite,
		xNormal: xNormalBite,
		yNormal: yNormalBite,
		zNormal: zNormalBite,
	} = teethAxisFinetuneRecord;
	if (centerBite && xNormalBite && yNormalBite && zNormalBite) {
		xmlData.dentalArch[0].transformBite = [
			{
				$: Object.fromEntries(
					[...centerBite, ...xNormalBite, ...yNormalBite, ...zNormalBite].map((val, index) => [
						`transform${index}`,
						val.toString(),
					])
				),
			},
		];
	}

	// 存牙弓线调整小球
	if (dentalArchAdjustRecord && Object.keys(dentalArchAdjustRecord).length > 0) {
		xmlData.dentalArch[0].adjustRecord = [];
		Object.entries(dentalArchAdjustRecord).forEach(([toothName, { center, invMatrix }], index) => {
			xmlData.dentalArch[0].adjustRecord[index] = {
				$: { name: toothName },
				transform: Object.fromEntries(
					[...center, ...invMatrix].map((val, indexT) => [`transform${indexT}`, val.toString()])
				),
			};
		});
	}

	// 什么都没有, 则不需要存
	if (Object.keys(xmlData.dentalArch[0]).length === 1) {
		delete xmlData.dentalArch;
	}
}

function UnMountToData(xmlData) {
	Reflect.deleteProperty(xmlData, "dentalArch");
}

/**
 * @description 将更新后的托槽信息写入原来的CADO文件并上传
 * @param token 令牌
 * @param userId 用户名
 * @param stlData stlObj.teeth[teethType]
 * @param xmlData xmlObj[teethType]
 * @param bracketData 更新后托槽数据
 * @param longAxisData 更新后长轴数据
 * @param url 上传路径
 * @param postFormData Formdata() 其中包括cado以外的其他必要上传数据
 * @param uploadConfig 用于上传进度显示
 * @param finishUploadFunc 用于完成时回调(正在上传/未开始上传)
 * @param successFunc 用于上传成功回调(成功提示弹窗)
 * @param failedFunc 用于上传失败回调(失败提示弹窗)
 */
function uploadCurrentData(
	stlData,
	xmlData,
	dataToMount,
	url,
	postFormData,
	uploadConfig,
	clear = false // 清理数据, 测试用
) {
	return new Promise((resolve, reject) => {
		if (clear) {
			UnMountToData(xmlData);
		} else {
			parseAndMountToData(xmlData, dataToMount);
		}
		//这里删掉了dentalArch，可能是测试需要。2023.1.4更新：将该行注释掉
		// UnMountToData(xmlData);
		let xml = new xml2js.Builder().buildObject({
			CADOProject: xmlData,
		});
		// 去除xml声明
		// xml = xml.slice(xml.indexOf("<CADOProject>"))

		// 拼接stl和xml构建CADO
		postFormData.append("file", new Blob([stlData, xml]));
		// FileSaver.saveAs(new Blob([stlData, xml]), teethType);

		// 上传
		sendRequestWithToken({
			method: "POST",
			url,
			data: postFormData,
			...uploadConfig,
		}).then((res) => {
			if (res.data.data) {
				resolve(res.data.data);
			} else {
				reject();
			}
		}, reject);
		// postRequestWithToken(
		//     url,
		//     postFormData,
		//     uploadConfig
		// ).then((res) => {
		//     if (res.data.data) {
		//         resolve(res.data.data);
		//     } else {
		//         reject();
		//     }
		// }, reject);
	});
}

export { uploadCurrentData };
