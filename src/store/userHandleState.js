import { findMatchPair } from "../hooks/arrangeFunc.js";
export default {
	namespaced: true,
	actions: {
		updatePatientName(context, value) {
			context.commit("UpdatePatientName", value);
		},
		updateDataCheckedState(context, value) {
			context.commit("UpdateDataCheckedState", value);
		},
		updateUserType(context, value) {
			context.commit("UpdateUserType", value);
		},
		updateUserId(context, value) {
			context.commit("UpdateUserId", value);
		},
		updateLoadedTeethType(context, value) {
			context.commit("UpdateLoadedTeethType", value);
		},
		updateLoadBracketName(context, value) {
			context.commit("UpdateLoadBracketName", value);
		},
		updateUploadingState(context, value) {
			context.commit("UpdateUploadingState", value);
		},
		updateUploadingProgress(context, value) {
			context.commit("UpdateUploadingProgress", value);
		},
		switchArrangeBarOpenState(context, value) {
			context.commit("SwitchArrangeBarOpenState", value);
		},
		updateArrangeProgress(context, value) {
			context.commit("UpdateArrangeProgress", value);
		},
	},
	mutations: {
		UpdatePatientName(state, value) {
			state.patientName = value;
		},
		UpdateDataCheckedState(state, value) {
			state.isDataChecked[value.teethType] = value.value;
		},
		UpdateUserType(state, value) {
			state.userType = value;
		},
		UpdateUserId(state, value) {
			state.userId = value;
		},
		UpdateLoadedTeethType(state, value) {
			state.loadedTeethType[value.teethType] = value.value;
		},
		UpdateLoadBracketName(state, value) {
			let { teethType, bracketNameList } = value;
			for (let name of bracketNameList) {
				state.bracketNameList[teethType].push(name);
			}
		},
		UpdateUploadingState(state, value) {
			state.uploadState[value.teethType].isUploading = value.value;
		},
		UpdateUploadingProgress(state, value) {
			state.uploadState[value.teethType].progress = value.value;
		},
		SwitchArrangeBarOpenState(state, value) {
			state.arrangeState.showBar = value;
		},
		UpdateArrangeProgress(state, value) {
			const arrangeState = state.arrangeState;
			for (let teethType in value) {
				for (let toothLoc in value[teethType]) {
					for (let stateKey in value[teethType][toothLoc]) {
						arrangeState[teethType][toothLoc][stateKey] = value[teethType][toothLoc][stateKey];
					}
				}
			}
		},
	},
	// state本身是proxy, 其中的对象取出来也是proxy, 但取出其中的基本数据类型就是直接的值而不是proxy
	// 在外部需要监视某个基本数据类型, 则需要套一层computed;
	// 如果本来就是对象, 则不用再套一层computed去监视, 这样反而监视不到变化!
	state: {
		// 页面加载时会读取的各种病例信息
		userType: "NORMAL", // 用户权限
		userId: "", // 用户Id, 在提交数据时使用
		patientName: "-------", // 病人姓名
		isDataChecked: {
			upper: false,
			lower: false,
		}, // 数据是否已递交
		loadedTeethType: {
			upper: false,
			lower: false,
		}, // 上颌牙/下颌牙是否成功加载
		bracketNameList: {
			upper: [],
			lower: [],
		}, // 该病例的上下颌牙所包含托槽名
		uploadState: {
			upper: {
				isUploading: false,
				progress: 0.0,
			},
			lower: {
				isUploading: false,
				progress: 0.0,
			},
		},
		arrangeState: {
			showBar: false, // 是否显示进度条, topPanel监听
			// 记录排牙进度, 门牙排完后, 2个+1, 开始分别排牙
			upper: {
				L: { finish: 0, total: 0 },
				R: { finish: 0, total: 0 },
			},
			lower: {
				L: { finish: 0, total: 0 },
				R: { finish: 0, total: 0 },
			},
		}, // 排牙进度
	},
	// 注意外部使用getter得到数据都不是proxy, 不管是不是对象, 所以都要套computed
	getters: {
		// 决定当前是否能上传上颌牙/下颌牙, 成功加载的上颌牙/下颌牙中除去已经核对的数据
		uploadType(state) {
			const ret = [];
			for (let teethType of ["upper", "lower"]) {
				if (state.loadedTeethType[teethType] === true && state.isDataChecked[teethType] === false) {
					ret.push(teethType);
				}
			}
			return ret;
		},
		// 撤回哪些
		teethTypeToRollBack(state) {
			const ret = [];
			for (let teethType of ["upper", "lower"]) {
				if (state.loadedTeethType[teethType] === true) {
					ret.push(teethType);
				}
			}
			return ret;
		},
		// 是否有数据正在递交
		isUploading(state) {
			return state.uploadState.upper.isUploading || state.uploadState.lower.isUploading;
		},
		// 能否操作上传状态的提示文字
		dataStateText(state, getters) {
			const uploadType = getters.uploadType;
			if (uploadType.length === 0) {
				return "不可修改";
			}
			if (uploadType.length === 2) {
				return "上下颌牙修改中";
			}
			if (uploadType.includes("upper")) {
				return "上颌牙修改中";
			}
			return "下颌牙修改中";
		},
		// 是否有数据已被递交
		hasAnyDataSubmit(state) {
			for (let teethType of ["upper", "lower"]) {
				if (state.isDataChecked[teethType] === true) {
					return true;
				}
			}
			return false;
		},
		// 排牙进度条相关信息和文字生成
		arrangeShowState(state) {
			const {
				showBar,
				upper: {
					L: { finish: finishUL, total: totalUL },
					R: { finish: finishUR, total: totalUR },
				},
				lower: {
					L: { finish: finishLL, total: totalLL },
					R: { finish: finishLR, total: totalLR },
				},
			} = state.arrangeState;
			return {
				isShow: showBar,
				UL: {
					percentage: totalUL === 0 ? 0 : (finishUL / totalUL) * 100,
					// text: finishUL+'/'+totalUL
					text: (totalUL === 0 ? 0 : (finishUL / totalUL) * 100).toFixed(0) + "%",
				},
				UR: {
					percentage: totalUR === 0 ? 0 : (finishUR / totalUR) * 100,
					// text: finishUR+'/'+totalUR,
					text: (totalUR === 0 ? 0 : (finishUR / totalUR) * 100).toFixed(0) + "%",
				},
				LL: {
					percentage: totalLL === 0 ? 0 : (finishLL / totalLL) * 100,
					// text: finishLL+'/'+totalLL，
					text: (totalLL === 0 ? 0 : (finishLL / totalLL) * 100).toFixed(0) + "%",
				},
				LR: {
					percentage: totalLR === 0 ? 0 : (finishLR / totalLR) * 100,
					// text: finishLR+'/'+totalLR,
					text: (totalLR === 0 ? 0 : (finishLR / totalLR) * 100).toFixed(0) + "%",
				},
			};
		},
		isArrangeConditionSatisfy(state) {
			let ret = {};
			for (let teethType of ["upper", "lower"]) {
				ret[teethType] =
					state.bracketNameList[teethType].length >= 5 &&
					findMatchPair(state.bracketNameList[teethType].map((name) => name.substring(1))).length >= 2;
			}
			return ret;
		},
		teethMatchPair(state) {
			let ret = {};
			for (let teethType of ["upper", "lower"]) {
				ret[teethType] = findMatchPair(state.bracketNameList[teethType].map((name) => name.substring(1)));
			}
			return ret;
		},
		arrangeTeethType(_state, getters) {
			let ret = [];
			for (let teethType of ["upper", "lower"]) {
				if (getters.isArrangeConditionSatisfy[teethType]) {
					ret.push(teethType);
				}
			}
			return ret;
		},
		isBracketDataMatchTeethType(state) {
			// 谨防上下颌牙数据相反的情况
			for (let teethType of ["upper", "lower"]) {
				let rightKey = teethType === "upper" ? "U" : "L";
				for (let toothName of state.bracketNameList[teethType])
					if (!toothName.startsWith(rightKey)) {
						return false;
					}
			}
			return true;
		},
	},
};
