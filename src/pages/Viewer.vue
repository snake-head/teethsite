<template>
	<div id="view">
		<Loading
			:upperState="loadingMessage.upper"
			:lowerState="loadingMessage.lower"
			:loadingProgress="loadingMessage.loadingProgress"
		/>
		<Dialog
			ref="dialog"
			:showMessage="showMessage"
			:saveCallBack="() => uploadDataOnline(false)"
			:submitCallBack="() => uploadDataOnline(true)"
		/>
		<div class="view-container">
			<TopPanel />
			<div class="main-body-container">
				<div class="left-panel">
					<div class="aside-body">
						<div class="menu-body">
							<div class="title">
								<div class="bg model-finetune-icon asidemenu-icon" />
								<span>细调操作</span>
								<div
									class="bg keyboard-bind icon-keyboard"
									:class="{ activate: selectKeyBoardEvent === 'bracket' }"
									@click="switchSelectKeyBoardEvent()"
								/>
							</div>
							<div class="item-title">设置调整步长</div>
							<div class="item-line">
								<div class="col-18 adjust-step">
									<label for="pan-step">平移: </label>
									<input id="pan-step" type="number" step="0.01" v-model.number="adjustStep" />mm
								</div>
							</div>
							<div class="item-line">
								<div class="col-18 adjust-step">
									<label for="rot-step">旋转: </label>
									<input id="rot-step" type="number" step="1.0" v-model.number="adjustAngle" />度
								</div>
							</div>
							<div class="item-title">平移</div>
							<div class="item-line">
								<div class="col-24 select-text">
									<span>
										当前:{{ currentSelectBracketName === "" ? "未选择" : currentSelectBracketName }}
									</span>
									<div class="adjust-button" @click="adjustButtonClick('RESETSINGLE')">
										重置
									</div>
								</div>
							</div>
							<div class="item-line">
								<div class="col-8" />
								<div class="col-8">
									<div class="adjust-button" @click="adjustButtonClick('UP')">
										<div class="orient-text">
											<div class="up-text" />
										</div>
									</div>
								</div>
							</div>
							<div class="item-line">
								<div class="col-8">
									<div class="adjust-button" @click="adjustButtonClick('LEFT')">
										<div class="orient-text">
											<div class="left-text" />
										</div>
									</div>
								</div>
								<div class="col-8">
									<div class="adjust-button" @click="adjustButtonClick('DOWN')">
										<div class="orient-text">
											<div class="down-text" />
										</div>
									</div>
								</div>
								<div class="col-8">
									<div class="adjust-button" @click="adjustButtonClick('RIGHT')">
										<div class="orient-text">
											<div class="right-text" />
										</div>
									</div>
								</div>
							</div>
							<div class="item-title">旋转</div>
							<div class="item-line">
								<div class="col-3" />
								<div class="col-8">
									<div class="adjust-button" @click="adjustButtonClick('ANTI')">
										<div class="orient-text">
											<div class="anti-text" />
											<div class="keybind-text" :class="{ show: isKeyBoardEventSelected }">
												z
											</div>
										</div>
									</div>
								</div>
								<div class="col-3" />
								<div class="col-8">
									<div class="adjust-button" @click="adjustButtonClick('ALONG')">
										<div class="orient-text">
											<div class="along-text" />
											<div class="keybind-text" :class="{ show: isKeyBoardEventSelected }">
												c
											</div>
										</div>
									</div>
								</div>
							</div>
							<div class="item-title" v-if="hasRotateInfo&&currentMode.straightenSimulation">转矩</div>
							<div class="item-line"  v-if="hasRotateInfo&&currentMode.straightenSimulation">
								<div class="col-3" />
								<div class="col-8">
									<div class="adjust-button" @click="adjustButtonClick('XANTI')">
										<div class="orient-text">
											<div class="anti-text" />
											<div class="keybind-text" :class="{ show: isKeyBoardEventSelected }">
												z
											</div>
										</div>
									</div>
								</div>
								<div class="col-3" />
								<div class="col-8">
									<div class="adjust-button" @click="adjustButtonClick('XALONG')">
										<div class="orient-text">
											<div class="along-text" />
											<div class="keybind-text" :class="{ show: isKeyBoardEventSelected }">
												c
											</div>
										</div>
									</div>
								</div>
							</div>
							<div class="title">
								<div class="bg model-finetune-icon asidemenu-icon" />
								<span>模拟矫正</span>
							</div>
							<div
								class="item-line"
								:class="{ hide: arrangeShowState.isShow || currentMode.straightenSimulation }"
							>
								<div class="col-8" />
								<div class="col-8">
									<div class="adjust-button" @click="updateCurrentMode('straightenSimulation', true)">
										<div class="orient-text">进入</div>
									</div>
								</div>
								<div class="col-8" />
							</div>
							<div
								class="item-line item-title"
								:class="{ hide: arrangeShowState.isShow || !currentMode.straightenSimulation }"
							>
								移动对象
							</div>
							<div
								class="item-line"
								:class="{ hide: arrangeShowState.isShow || !currentMode.straightenSimulation }"
							>
								<div class="col-3" />
								<div class="col-8">
									<div
										class="adjust-button"
										:class="{ activate: simMode === 'simToothFix' }"
										@click="updateSimMode('simToothFix')"
									>
										托槽
									</div>
								</div>
								<div class="col-3" />
								<div class="col-8">
									<div
										class="adjust-button"
										:class="{ activate: simMode === 'simBracketFix' }"
										@click="updateSimMode('simBracketFix')"
									>
										牙齿
									</div>
								</div>
							</div>
							<div
								class="item-line item-title"
								:class="{ hide: arrangeShowState.isShow || !currentMode.straightenSimulation }"
							>
								操作
							</div>
							<div
								class="item-line"
								:class="{ hide: arrangeShowState.isShow || !currentMode.straightenSimulation }"
							>
								<div class="col-3" />
								<div class="col-8">
									<div class="adjust-button" @click="simForceUpdate()">
										<div class="orient-text">更新</div>
									</div>
								</div>
								<div class="col-3" />
								<div class="col-8">
									<div
										class="adjust-button"
										@click="updateCurrentMode('straightenSimulation', false)"
									>
										<div class="orient-text">退出</div>
									</div>
								</div>
							</div>
							<div
								class="item-detail-line"
								:class="{ hide: !isActorLoadedFinish.upper || arrangeMessage.upper === '' }"
							>
								<span>{{ arrangeMessage.upper }}</span>
							</div>
							<div
								class="item-detail-line"
								:class="{ hide: !isActorLoadedFinish.lower || arrangeMessage.lower === '' }"
							>
								<span>{{ arrangeMessage.lower }}</span>
							</div>
							<div class="item-line" :class="{ hide: !arrangeShowState.isShow }">
								<div class="col-24">正在排牙中......</div>
							</div>
							<div class="title clickable" @click="dialog.changeDialogShowState('dataSave', true)">
								<div class="bg model-save-online-icon asidemenu-icon" />
								<span>方案在线保存</span>
							</div>
							<div class="title clickable" @click="dialog.changeDialogShowState('dataSubmit', true)">
								<div class="bg model-save-online-icon asidemenu-icon" />
								<span>方案在线递交</span>
							</div>
							<div
								class="title clickable"
								@click="rollbackCheckedData()"
								v-if="userInfo.isRollBackAuthorized"
							>
								<div class="bg model-save-online-icon asidemenu-icon" />
								<span>递交方案撤回</span>
							</div>
							<div class="item-detail-line wrap" :class="{ hide: isBracketDataMatchMessage === '' }">
								<span>{{ isBracketDataMatchMessage }}</span>
							</div>
						</div>
					</div>
				</div>
				<el-main class="view-vtk-main">
					<el-container class="vtk-view-container">
						<el-aside width="100%" class="view-aside-menu">
							<el-button-group class="model-buttonGroup">
								<el-button
									size="small"
									@click="actorInScene.upper = !actorInScene.upper"
									:disabled="!isActorLoadedFinish.upper"
								>
									<div
										class="bg"
										:class="[
											actorInScene.upper ? 'show-upper-teeth-icon' : 'hide-upper-teeth-icon',
											{ disabled: !isActorLoadedFinish.upper },
										]"
									/>
								</el-button>
								<el-button
									size="small"
									@click="actorInScene.lower = !actorInScene.lower"
									:disabled="!isActorLoadedFinish.lower"
								>
									<div
										class="bg"
										:class="[
											actorInScene.lower ? 'show-lower-teeth-icon' : 'hide-lower-teeth-icon',
											{ disabled: !isActorLoadedFinish.lower },
										]"
									/>
								</el-button>
							</el-button-group>
							<el-button-group class="buttonGroup">
								<el-button
									size="small"
									@click="resetViewDirection('LEFT')"
									:disabled="!actorInScene.upper && !actorInScene.lower"
								>
									<div
										class="left-orient-icon bg"
										:class="{ disabled: !actorInScene.upper && !actorInScene.lower }"
									/>
								</el-button>
								<el-button
									size="small"
									@click="resetViewDirection('FRONT')"
									:disabled="!actorInScene.upper && !actorInScene.lower"
								>
									<div
										class="front-orient-icon bg"
										:class="{ disabled: !actorInScene.upper && !actorInScene.lower }"
									/>
								</el-button>
								<el-button
									size="small"
									@click="resetViewDirection('RIGHT')"
									:disabled="!actorInScene.upper && !actorInScene.lower"
								>
									<div
										class="right-orient-icon bg"
										:class="{ disabled: !actorInScene.upper && !actorInScene.lower }"
									/>
								</el-button>
							</el-button-group>
							<el-button-group class="teeth-buttonGroup">
								<el-button
									size="small"
									@click="changeBracketArchShowState()"
									:disabled="!isActorLoadedFinish.upper && !isActorLoadedFinish.lower"
								>
									<div
										class="bg"
										:class="{
											'show-bracket-arch-icon': actorInScene.arch === 0,
											'show-arch-icon': actorInScene.arch === 1,
											'show-bracket-icon': actorInScene.arch === 2,
											'hide-bracket-icon': actorInScene.arch === 3,
											'disabled': !isActorLoadedFinish.upper && !isActorLoadedFinish.lower,
										}"
									/>
								</el-button>
								<el-button
									size="small"
									@click="actorInScene.teethWithGingiva = (actorInScene.teethWithGingiva + 1) % 2"
									:disabled="
										(!isActorLoadedFinish.upper && !isActorLoadedFinish.lower) ||
											currentMode.straightenSimulation
									"
								>
									<div
										class="bg"
										:class="{
											'show-teeth-gingiva-icon': actorInScene.teethWithGingiva === 0,
											'show-teeth-icon': actorInScene.teethWithGingiva === 1,
											'show-gingiva-icon': actorInScene.teethWithGingiva === 2,
											'disabled': !isActorLoadedFinish.upper && !isActorLoadedFinish.lower,
										}"
									/>
								</el-button>
								<el-button
									size="small"
									@click="actorInScene.axis = !actorInScene.axis"
									:disabled="!isActorLoadedFinish.upper && !isActorLoadedFinish.lower"
								>
									<div
										class="bg"
										:class="[
											actorInScene.axis ? 'show-axis-icon' : 'hide-axis-icon',
											{ disabled: !isActorLoadedFinish.upper && !isActorLoadedFinish.lower },
										]"
									/>
								</el-button>
								<!-- 2023.4.12更新：用于隐藏/显示原始牙列 -->
								<el-button
									size="small"
									@click="changeOriginToothShowState()"
									:disabled="
										(!isActorLoadedFinish.upper && !isActorLoadedFinish.lower) ||
											!currentMode.straightenSimulation
									"
								>
									<div
										class="bg"
										:class="{
											'hide-origin-icon': originShowStateFlag === 0,
											'show-origin-icon': originShowStateFlag === 1,
											'hide-originGingiva-icon': originShowStateFlag === 2,
											'disabled': !isActorLoadedFinish.upper && !isActorLoadedFinish.lower,
										}"
									/>
								</el-button>
							</el-button-group>
							<div class="slider-block" v-if="originShowStateFlag!=0">
								<el-slider v-model="toothOpacity" />
							</div>
							<ViewerMain
								ref="viewerMain"
								:actorInScene="actorInScene"
								:changeLoadingMessage="changeLoadingMessage"
							/>
						</el-aside>
					</el-container>
				</el-main>
			</div>
		</div>
	</div>
</template>

<script setup>
import { ref, reactive, watch, computed, getCurrentInstance, onMounted, toRaw, provide } from "vue";
import { useStore } from "vuex";
import TopPanel from "../components/TopPanel";
import ViewerMain from "../components/ViewerComponent/ViewerMain";
import Loading from "../components/ViewerComponent/Loading";
import { throttle } from "@kitware/vtk.js/macro";
import Dialog from "../components/Dialog/index";

onMounted(() => {
	window.onbeforeunload = function(e) {
		let isFineTuned = false;
		for (let teethType of ["upper", "lower"]) {
			viewerMain.value.bracketData[teethType].forEach((item) => {
				const {
					position,
					fineTuneRecord: { actorMatrix },
				} = item;
				for (let matType of ["center", "xNormal", "yNormal", "zNormal"]) {
					for (let i = 0; i < 2; i++) {
						if (position[matType][i] !== actorMatrix[matType][i]) {
							isFineTuned = true;
						}
					}
				}
			});
		}
		if (dialog.value.isAnyDialogSubmit || isFineTuned) {
			e.preventDefault();
			// 兼容IE8和Firefox 4之前的版本
			e.returnValue = "当前操作可能会造成提交数据丢失，是否确认继续？";
			// Chrome, Safari, Firefox 4+, Opera 12+ , IE 9+
			return "当前操作可能会造成提交数据丢失，是否确认继续？";
		}
	};
});
const { proxy } = getCurrentInstance();
const dialog = ref(null);
const viewerMain = ref(null);
const store = useStore();
const loadedBracketNameList = store.state.userHandleState.bracketNameList;
const uploadType = computed(() => store.getters["userHandleState/uploadType"]);
const isUploading = computed(() => store.getters["userHandleState/isUploading"]);
const hasAnyDataSubmit = computed(() => store.getters["userHandleState/hasAnyDataSubmit"]); 

const userInfo = computed(() => {
	return {
		isRollBackAuthorized: store.state.userHandleState.userType === "MANAGER", // 是否允许该用户撤回方案(只有管理员能够撤回)
	};
});
const currentMode = computed(() => store.state.actorHandleState.currentMode);
const fineTuneMode = computed(() => store.getters["actorHandleState/fineTuneMode"]);
const simMode = computed(() => store.state.actorHandleState.simMode);
const toothOpacity = computed({
      get: () => store.state.actorHandleState.toothOpacity,
      set: (value) => store.dispatch("actorHandleState/setToothOpacity", value),
    })
function updateSimMode(value) {
	store.dispatch("actorHandleState/updateSimMode", value);
}
function updateCurrentMode(mode, value) {
	if (mode === "straightenSimulation" && value === false) {
		store.dispatch("actorHandleState/updateCurrentShowPanel", -1);
	}
	store.dispatch("actorHandleState/updateCurrentMode", {
		[mode]: value,
	});
}
watch(fineTuneMode, (newVal, oldVal) => {
	// 进入/退出模拟排牙有下面的模拟排牙函数操作(先排完在操作)
	// 此处只关注模拟排牙两种细调模式的切换, 更新userMatrix
	if (
		(newVal === "simToothFix" && oldVal === "simBracketFix") ||
		(newVal === "simBracketFix" && oldVal === "simToothFix")
	) {
		viewerMain.value.applyUserMatrixWhenSwitchMode(oldVal, newVal, true);
	}
});
let adjustStep = ref(0.1);
let adjustAngle = ref(1.0);

let uploadStateMessage = {
	upper: {
		success: () => {
			proxy.$message({
				message: "上传上颌牙成功",
				type: "success",
			});
		},
		failed: () => {
			proxy.$message({
				message: "上传上颌牙失败",
				type: "error",
			});
		},
	},
	lower: {
		success: () => {
			proxy.$message({
				message: "上传下颌牙成功",
				type: "success",
			});
		},
		failed: () => {
			proxy.$message({
				message: "上传下颌牙失败",
				type: "error",
			});
		},
	},
};

let loadingMessage = reactive({
	upper: {
		message: "-",
		type: "wait",
		progress: "-",
	},
	lower: {
		message: "-",
		type: "wait",
		progress: "-",
	},
	loadingProgress: "-/-",
});

const arrangeShowState = computed(() => store.getters["userHandleState/arrangeShowState"]);

let actorInScene = reactive({
	upper: false, // 全上颌牙显示/隐藏
	upperOrigin: false, // 上颌牙原始牙列显示/隐藏
	upperOriginBracket: false, // 上颌牙原始托槽显示/隐藏
	upperOriginGingiva: false,
	lower: false, // 全下颌牙显示/隐藏
	lowerOrigin: false, // 下颌牙原始牙列显示/隐藏
	lowerOriginBracket: false, // 下颌牙原始托槽显示/隐藏
	lowerOriginGingiva: false,
	teethWithGingiva: 1, // 牙齿+牙龈0/牙齿1
	axis: false, // 坐标轴显示/隐藏
	arch: 2, // 牙弓线显示01/隐藏23, 托槽显示02/隐藏13
});

const currentSelectBracketName = computed(() => store.state.actorHandleState.currentSelectBracketName);

const isArrangeConditionSatisfy = computed(() => store.getters["userHandleState/isArrangeConditionSatisfy"]);

let arrangeMessage = computed(() => {
	// 排牙条件: 托槽总数多于5个 && 托槽左边右边至少各有1个 && 2对s
	return {
		upper: isArrangeConditionSatisfy.value.upper ? "" : "注：上颌牙托槽不满足排牙条件，不会进行排牙",
		lower: isArrangeConditionSatisfy.value.lower ? "" : "注：下颌牙托槽不满足排牙条件，不会进行排牙",
	};
});
const isBracketDataMatchTeethType = computed(() => store.getters["userHandleState/isBracketDataMatchTeethType"]);
let isBracketDataMatchMessage = computed(() => {
	return isBracketDataMatchTeethType.value ? "" : "该病例上下颌牙数据混乱, 或许会造成操作失误";
});
let isActorLoadedFinish = store.state.userHandleState.loadedTeethType;
// 用于初次加载的监视, 更新该状态的函数在viewerMain中, 注意必须上下颌牙同时加载完成
// 成功/失败 失败/成功 成功/成功 3种状态才会去更新isActorLoadedFinish
watch(isActorLoadedFinish, () => {
	// Actor初次加载成功后直接渲染
	if (isActorLoadedFinish.upper) {
		actorInScene.upper = true;
		actorInScene.teethWithGingiva = 0;
		actorInScene.axis = true;
		actorInScene.arch = 0;
	}
	if (isActorLoadedFinish.lower) {
		actorInScene.lower = true;
		actorInScene.teethWithGingiva = 0;
		actorInScene.axis = true;
		actorInScene.arch = 0;
	}
	if (!currentMode.value.fineTune) {
		// 进入细调, 开启托槽选择
		updateCurrentMode("fineTune", true);
		// 2023.1.5更新：不需要直接进入排牙
		// 是否满足排牙条件, 是的话直接进入排牙
		// if (store.getters["actorHandleState/isArrangeDataComplete"]) {
		// 	updateCurrentMode("straightenSimulation", true);
		// }
	}
});

function changeLoadingMessage(newValue) {
	const {
		upper: { message: upperMessage, type: upperType, progress: upperProgress },
		lower: { message: lowerMessage, type: lowerType, progress: lowerProgress },
		loadingProgress,
	} = newValue;

	loadingMessage.upper.message = upperMessage;
	loadingMessage.upper.type = upperType;
	loadingMessage.upper.progress = upperProgress;

	loadingMessage.lower.message = lowerMessage;
	loadingMessage.lower.type = lowerType;
	loadingMessage.lower.progress = lowerProgress;

	loadingMessage.loadingProgress = loadingProgress;
}
const selectKeyBoardEvent = computed(() => store.state.actorHandleState.selectKeyBoardEvent);
const isKeyBoardEventSelected = computed(() => selectKeyBoardEvent.value === "bracket");
function switchSelectKeyBoardEvent() {
	store.dispatch(
		"actorHandleState/updateSelectKeyBoardEvent",
		selectKeyBoardEvent.value !== "bracket" ? "bracket" : ""
	);
}
watch(selectKeyBoardEvent, (newVal, oldVal) => {
	if (oldVal === "bracket") {
		document.removeEventListener("keydown", throttleKeyControlBracketFineTune);
		window.removeEventListener(
			"keydown",
			preventScroll // 防止触发方向键默认滚动事件
		);
	}
	if (newVal === "bracket") {
		document.addEventListener("keydown", throttleKeyControlBracketFineTune);
		window.addEventListener(
			"keydown",
			preventScroll // 防止触发方向键默认滚动事件
		);
	}
});
function preventScroll(event) {
	switch (event.key) {
		case "ArrowUp":
		case "ArrowDown":
		case "ArrowLeft":
		case "ArrowRight":
		case "z":
		case "c":
		case " ":
			event.preventDefault();
			break;
		default:
			break;
	}
}
const throttleKeyControlBracketFineTune = throttle(keyControlBracketFineTune, 30);
function keyControlBracketFineTune(event) {
	switch (event.key) {
		case "ArrowUp":
			adjustButtonClick("UP");
			break;
		case "ArrowDown":
			adjustButtonClick("DOWN");
			break;
		case "ArrowLeft":
			adjustButtonClick("LEFT");
			break;
		case "ArrowRight":
			adjustButtonClick("RIGHT");
			break;
		case "z":
		case "Z":
			adjustButtonClick("ANTI");
			break;
		case "c":
		case "C":
			adjustButtonClick("ALONG");
			break;
		default:
			break;
	}
}
// 用于模拟排牙模式下的手动更新
function simForceUpdate() {
	viewerMain.value.forceUpdateArrange();
}
/**
 * @description 切换视图方向(前/左/右)
 */
function resetViewDirection(orientation) {
	if (actorInScene.upper) {
		// 存在上颌牙则以上颌牙为主
		viewerMain.value.resetView(orientation, "upper");
	} else if (actorInScene.lower) {
		//只存在下颌牙则以下颌牙为主
		viewerMain.value.resetView(orientation, "lower");
	}
	// else: 不存在模型
}

/**
 * @description 细调托槽(上下左右/旋转):"UP"|"DOWN"|"LEFT"|"RIGHT"|"ANTI"|"ALONG"|"CANCEL"|"RESET"|"CONFIRM"
 */
function adjustButtonClick(moveType) {
	if (
		!uploadType.value.includes("upper") &&
		toRaw(loadedBracketNameList.upper).includes(currentSelectBracketName.value)
		// currentSelectBracketName.value.startsWith("U")
	) {
		proxy.$message({
			message: "上颌牙数据已递交, 无法继续修改",
			type: "error",
		});
		return;
	}
	if (
		!uploadType.value.includes("lower") &&
		toRaw(loadedBracketNameList.lower).includes(currentSelectBracketName.value)
	) {
		proxy.$message({
			message: "下颌牙数据已递交, 无法继续修改",
			type: "error",
		});
		return;
	}
	if (moveType === "RESETALL") {
		// 重置所有托槽 不需要选中托槽
		viewerMain.value.resetAllBracket();
		return;
	}

	if (currentSelectBracketName.value === "") {
		proxy.$message({
			message: "请选择托槽",
			type: "error",
		});
		return;
	}

	if (moveType === "RESETSINGLE") {
		// 重置单个托槽
		if (currentSelectBracketName.value === "") {
			proxy.$message({
				message: "请选择托槽",
				type: "error",
			});
			return;
		}
		viewerMain.value.resetSingleBracket();
		return;
	}

	// 细调操作
	let option = {
		moveStep: 0,
		moveType,
	};
	if (moveType.includes("ALONG") || moveType.includes("ANTI")) {
		// 旋转
		option.moveStep = adjustAngle.value;
	} else {
		// 平移
		option.moveStep = adjustStep.value;
		// 下颌牙的上下左右向相反方向操作
		if (currentSelectBracketName.value.startsWith("L")) {
			option.moveStep = -option.moveStep;
		}
	}
	if (fineTuneMode.value === "simBracketFix") {
		option.moveStep = -option.moveStep;
	}
	if (!isBracketDataMatchTeethType.value) {
		option.moveStep = -option.moveStep;
	}
	viewerMain.value.fineTuneBracket(option);
}
function showMessage(message, type) {
	proxy.$message({
		message,
		type,
	});
}
watch(isUploading, (newVal, oldVal) => {
	// 2种上传完成, 对话框关闭
	if (oldVal === true && newVal === false) {
		dialog.value.finishProcess();
	}
});
function uploadDataOnline(submit = false) {
	if (uploadType.value.length === 0) {
		// 所有数据已递交 / 无牙齿模型加载完成, 后者不会发生
		proxy.$message({
			message: "该数据已递交, 无法继续修改",
			type: "error",
		});
		return;
	}
	viewerMain.value.uploadDataOnline(uploadStateMessage, submit);
}

function changeBracketArchShowState() {
	// 跳过状态1=只显示牙弓线
	let nextState = (actorInScene.arch + 1) % 4;
	if (nextState === 1) {
		nextState = 2;
	}
	actorInScene.arch = nextState;
}

let originShowStateFlag = ref(0);
/**
 * @description: 使用originShowStateFlag来控制原始牙列的显示状态：
 * 0：调整为全部显示
 * 1：不显示牙龈
 * 2：全部不显示
 * @return {*}
 * @author: ZhuYichen
 */
function changeOriginToothShowState(){
	switch(originShowStateFlag.value) {
		case 0: 
			actorInScene.upperOrigin=true;
			actorInScene.lowerOrigin=true;
			actorInScene.upperOriginBracket = true;
			actorInScene.lowerOriginBracket = true;
			actorInScene.upperOriginGingiva = true;
			actorInScene.lowerOriginGingiva = true;
			break;
		case 1:
			actorInScene.upperOrigin=true;
			actorInScene.lowerOrigin=true;
			actorInScene.upperOriginBracket = true;
			actorInScene.lowerOriginBracket = true;
			actorInScene.upperOriginGingiva = false;
			actorInScene.lowerOriginGingiva = false;
			break;
		case 2:
			actorInScene.upperOrigin=false;
			actorInScene.lowerOrigin=false;
			actorInScene.upperOriginBracket = false;
			actorInScene.lowerOriginBracket = false;
			actorInScene.upperOriginGingiva = false;
			actorInScene.lowerOriginGingiva = false;
			break;
	}
	originShowStateFlag.value += 1;
	originShowStateFlag.value %= 3;
}

/**
 * @description: 用于在退出排牙时，将状态重置
 * @return {*}
 * @author: ZhuYichen
 */
function resetOriginShowStateFlag(){
	originShowStateFlag.value = 0;
}

provide('resetOriginShowStateFlag', resetOriginShowStateFlag)

function rollbackCheckedData() {
	if (!hasAnyDataSubmit.value) {
		proxy.$message({
			message: "数据未递交",
			type: "error",
		});
		return;
	}
	viewerMain.value.rollbackCheckedData();
}

const showAndHide = ()=>{
	actorInScene.upperOrigin = false
	actorInScene.lowerOrigin = false
	actorInScene.upperOriginBracket = false
	actorInScene.lowerOriginBracket = false
	actorInScene.upperOriginGingiva = false
	actorInScene.lowerOriginGingiva = false
	actorInScene.upper = false
	actorInScene.lower = false
	setTimeout(() => {
		actorInScene.upper = true
		actorInScene.lower = true
	}, 0);
}
provide('showAndHide', showAndHide)

const hasRotateInfo = ref(false);
/**
 * @description: 在ViewerMain中监视到有转矩信息后，将转矩按钮改为可见
 * @return {*}
 * @author: ZhuYichen
 */
const showRotateButton = ()=>{
	hasRotateInfo.value=true;
}
provide('showRotateButton', showRotateButton)

</script>

<style lang="scss" scoped>
$container-width: 940px;
$container-height: 865px;
$left-panel-width-normal: 210px;
$trans-time: 0.2s;
$view-head-height: 66px;
$title-line-height: 50px;
$item-title-height: 35px;
$item-line-height: 40px;
$progress-line-height: 20px;
$btn-width: 50px;
$btn-height: 30px;

@function widthCol($n) {
	@return $n/24 * 100%;
}

#view {
	width: 100%;
	height: 100%;
	background-color: ivory;
	font-family: "微软雅黑";
}
.view-container {
	width: 100%;
	height: 100%;
	min-width: $container-width;
	min-height: $container-height;
	overflow: auto;
	.main-body-container {
		height: calc(100% - $view-head-height);
		overflow: hidden;
		position: relative;
		.left-panel {
			transition: $trans-time;
			width: $left-panel-width-normal;
			height: 100%;
			position: absolute;
			top: 0;
			left: 0;
			// z-index: 100;
			.aside-body {
				width: 100%;
				height: 100%;
				background: #545c64;
				color: rgb(255, 255, 255);
				overflow: hidden;
				user-select: none;
				transition: 0.2s;
				visibility: visible;
				position: absolute;

				.asidemenu-icon {
					width: 20px;
					height: 20px;
					margin-right: 5px;
					vertical-align: middle;
					text-align: center;
					display: inline-flex;
				}

				.title {
					padding: 0 $left-panel-width-normal/15;
					height: $title-line-height;
					line-height: $title-line-height;
					font-size: 15px;
					background-color: rgb(84, 92, 100);
					position: relative;
					box-sizing: border-box;
					span {
						vertical-align: middle;
					}

					&:hover {
						background-color: rgb(67, 74, 80);
					}
					&.clickable {
						cursor: pointer;
						/*border: transparent 2px solid;*/
						&:hover {
							border: rgb(236, 168, 25) 2px solid;
						}
					}

					.keyboard-bind {
						position: absolute;
						right: $title-line-height * 0.15;
						top: $title-line-height * 0.15;
						width: $title-line-height * 0.7;
						height: $title-line-height * 0.7;
						border: transparent 2px solid;
						cursor: pointer;
						border-radius: 5px;
						&:hover {
							border: rgb(236, 168, 25) 2px solid;
						}
						&.activate {
							background-color: #f4f4f4;
							border: rgb(137, 211, 245) 2px solid;
						}
					}
				}

				.item-title {
					font-size: 12px;
					padding-left: $left-panel-width-normal/10;
					height: $item-title-height;
					line-height: $item-title-height;
					color: #909399;
					transition: $trans-time;

					&:hover {
						background-color: rgb(80, 87, 95);
					}
				}

				.item-line {
					display: flex;
					justify-content: flex-start;
					white-space: nowrap;
					padding: 0 $left-panel-width-normal/10;
					height: $item-line-height;
					line-height: $item-line-height;
					font-size: 12px;
					transition: $trans-time;

					&:hover {
						background-color: rgb(80, 87, 95);
					}
					&.hide {
						height: 0;
						opacity: 0;
						visibility: hidden;
						transform: translate(0, -$item-line-height/2);
					}
					&.disabled {
						pointer-events: none;
						opacity: 0.6;
					}
					.adjust-step {
						/*text-align: center;*/
						padding-left: $left-panel-width-normal/15;
						transition: $trans-time;
						input {
							width: 60px;
							outline: none;
							text-align: center;
						}
					}
					.adjust-button {
						width: $btn-width;
						height: $btn-height;
						line-height: $btn-height;
						margin: ($item-line-height - $btn-height - 4px)/2 auto;
						border: 2px outset rgb(133, 133, 133);
						cursor: pointer;
						display: block;
						border-radius: 3px;
						background-color: rgb(230, 230, 230);
						color: black;
						position: relative;
						transition: $trans-time;
						text-align: center;
						&:hover {
							background-color: rgb(240, 240, 240);
						}
						&:active {
							background-color: rgb(220, 220, 220);
						}
						&.activate {
							background-color: #f4f4f4;
							border: rgb(137, 211, 245) 2px solid;
							&::after {
								content: "\2714";
								background: rgb(94, 199, 226);
								color: white;
								display: inline-block;
								font-size: 14px;
								width: 16px;
								height: 16px;
								border-radius: 50%;
								line-height: 16px;
							}
						}
						&.settings {
							width: $btn-width * 2.4;
							margin: ($item-line-height - $btn-height * 0.7 - 4px)/2 auto;
							height: $btn-height * 0.7;
							line-height: $btn-height * 0.7;
						}

						.orient-text {
							text-align: center;
							width: $btn-width;
							height: $btn-height;
							line-height: $btn-height;
							position: absolute;
							left: 0;
							top: 0;
							display: flex;
							justify-content: center;
							perspective: 800px;
							perspective-origin: 100% 0;
							.up-text {
								border-right: 10px solid transparent;
								border-left: 10px solid transparent;
								border-bottom: 17.3px solid rgba(67, 74, 80, 0.9);
								position: absolute;
								left: calc($btn-width/2 - 10px);
								top: calc($btn-height/2 - 17.3px / 2);
								transition: $trans-time;
							}
							.left-text {
								border-top: 10px solid transparent;
								border-bottom: 10px solid transparent;
								border-right: 17.3px solid rgba(67, 74, 80, 0.85);
								position: absolute;
								left: calc($btn-width/2 - 17.3px / 2);
								top: calc($btn-height/2 - 10px);
								transition: $trans-time;
							}
							.down-text {
								border-right: 10px solid transparent;
								border-left: 10px solid transparent;
								border-top: 17.3px solid rgba(67, 74, 80, 0.85);
								position: absolute;
								left: calc($btn-width/2 - 10px);
								top: calc($btn-height/2 - 17.3px / 2);
								transition: $trans-time;
							}
							.right-text {
								border-top: 10px solid transparent;
								border-bottom: 10px solid transparent;
								border-left: 17.3px solid rgba(67, 74, 80, 0.85);
								position: absolute;
								left: calc($btn-width/2 - 17.3px / 2);
								top: calc($btn-height/2 - 10px);
								transition: $trans-time;
							}
							.out-text {
								border-right: 10px solid transparent;
								border-left: 10px solid transparent;
								border-top: 17.3px solid rgba(67, 74, 80, 0.85);
								position: absolute;
								left: calc($btn-width/2 - 10px);
								top: calc($btn-height/2 - 17.3px / 2);
								transform: scaleY(0.5) skewX(-30deg);
								transition: $trans-time;
								&.keybind {
									opacity: 0;
									transform: scaleY(0.5) skewX(-30deg) translateY(-5px);
								}
							}
							.in-text {
								border-right: 10px solid transparent;
								border-left: 10px solid transparent;
								border-bottom: 17.3px solid rgba(67, 74, 80, 0.9);
								position: absolute;
								left: calc($btn-width/2 - 10px);
								top: calc($btn-height/2 - 17.3px / 2);
								transform: scaleY(0.5) skewX(-30deg) translateZ(0);
								transition: $trans-time;
								&.keybind {
									opacity: 0;
									transform: scaleY(0.5) skewX(-30deg) translateY(-5px);
								}
							}
							.anti-text {
								position: absolute;
								transform: scale(2);
								transition: $trans-time;
								&::before {
									content: "\21B6";
								}
								&.keybind {
									opacity: 0;
									transform: scale(2) translateY(-5px);
								}
							}
							.along-text {
								position: absolute;
								transform: scale(2);
								transition: $trans-time;
								&::before {
									content: "\21B7";
								}
								&.keybind {
									opacity: 0;
									transform: scale(2) translateY(-5px);
								}
							}
							.bg {
								width: $btn-height;
								height: $btn-height;
								transition: $trans-time;
								&.keybind {
									opacity: 0;
									transform: translateY(-5px);
								}
							}
							.keybind-text {
								position: absolute;
								font-size: 18px;
								height: 18px;
								width: 18px;
								line-height: 18px;
								background-color: #e6e6e6;
								border-radius: 2px;
								box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
								border: 1px solid #5b6166;
								transition: $trans-time;
								top: -8px;
								left: -6px;
								opacity: 0;
								visibility: hidden;
								&.show {
									top: -6px;
									left: -6px;
									opacity: 1;
									visibility: visible;
								}
							}
							@media screen and (min--moz-device-pixel-ratio: 0) {
								.anti-text,
								.along-text {
									transform-origin: 50% 60%;
								}
							}
						}
						&:hover {
							.up-text {
								border-bottom-color: rgba(33, 37, 40, 0.95);
								transform: scale(1.1) translateY(-3px);
							}
							.left-text {
								border-right-color: rgba(33, 37, 40, 0.95);
								transform: scale(1.1) translateX(-3px);
							}
							.down-text {
								border-top-color: rgba(33, 37, 40, 0.95);
								transform: scale(1.1) translateY(3px);
							}
							.right-text {
								border-left-color: rgba(33, 37, 40, 0.95);
								transform: scale(1.1) translateX(3px);
							}
							.out-text {
								transform: scaleY(0.5) skewX(-30deg) translateZ(180px);
							}
							.in-text {
								transform: scaleY(0.5) skewX(-30deg) translateZ(-200px);
							}
							.anti-text {
								transform: scale(2) rotate(-45deg);
							}
							.along-text {
								transform: scale(2) rotate(45deg);
							}
						}
						&:active {
							.up-text {
								border-bottom-color: rgba(33, 37, 40, 1);
								transform: scale(1.1) translateY(-5px);
							}
							.left-text {
								border-right-color: rgba(33, 37, 40, 1);
								transform: scale(1.1) translateX(-5px);
							}
							.down-text {
								border-top-color: rgba(33, 37, 40, 1);
								transform: scale(1.1) translateY(5px);
							}
							.right-text {
								border-left-color: rgba(33, 37, 40, 1);
								transform: scale(1.1) translateX(5px);
							}
							.out-text {
								transform: scaleY(0.5) skewX(-30deg) translateZ(250px);
							}
							.in-text {
								transform: scaleY(0.5) skewX(-30deg) translateZ(-350px);
							}
							.anti-text {
								transform: scale(2) rotate(-60deg);
							}
							.along-text {
								transform: scale(2) rotate(60deg);
							}
						}
					}
					.col-3 {
						width: widthCol(3);
					}
					.col-5 {
						width: widthCol(5);
					}
					.col-8 {
						width: widthCol(8);
					}
					.col-12 {
						width: widthCol(12);
					}
					.col-18 {
						width: widthCol(18);
					}
					.col-24 {
						width: widthCol(24);
						text-align: center;
					}
					.select-text {
						position: relative;
						font-size: 12px;
						text-align: center;
						color: khaki;
						.adjust-button {
							position: absolute;
							top: $btn-height * 0.15;
							right: -10px;
							height: $btn-height * 0.7;
							line-height: $btn-height * 0.7;
							opacity: 0;
							visibility: hidden;
						}
						&:hover {
							.adjust-button {
								opacity: 1;
								visibility: visible;
								right: -6px;
							}
						}
					}
				}
				.item-detail-line {
					display: flex;
					justify-content: flex-start;
					/*white-space: normal;*/
					white-space: nowrap;
					padding: 0 $left-panel-width-normal/15;
					height: auto;
					line-height: $item-line-height / 2;
					font-size: 12px;
					transition: $trans-time;
					color: #a8a8a8;
					&:hover {
						background-color: rgb(80, 87, 95);
					}
					&.hide {
						height: 0;
						opacity: 0;
						visibility: hidden;
						transform: translate(0, -$item-line-height/2);
					}
					span {
						transition: $trans-time;
						transform-origin: left;
					}
					&.wrap {
						white-space: normal;
					}
				}
				.tool-tip-detail-line {
					width: calc(100% - $left-panel-width-normal/15 * 2);
					display: flex;
					justify-content: flex-start;
					white-space: normal;
					word-break: break-all;
					padding: 0 $left-panel-width-normal/15;
					height: auto;
					line-height: $item-line-height / 2;
					font-size: 12px;
					transition: $trans-time;
					color: #a8a8a8;
					&:hover {
						background-color: rgb(80, 87, 95);
					}
					span {
						transition: $trans-time;
						transform-origin: left;
					}
				}
				.progress-line {
					white-space: nowrap;
					padding: 0 $left-panel-width-normal/10;
					height: $progress-line-height;
					line-height: $progress-line-height;
					font-size: 12px;
					transition: $trans-time;

					&:hover {
						background-color: rgb(80, 87, 95);
					}
					&.hide {
						height: 0;
						opacity: 0;
						visibility: hidden;
						transform: translate(0, -$item-line-height/2);
					}
				}
			}
			.bottom-drag-bar {
				transition: $trans-time;
				position: absolute;
				height: 25px;
				width: 100%;
				bottom: -22px;
				cursor: pointer;
				background: linear-gradient(to right, rgba(128, 128, 128, 0.8) 50%, rgba(128, 128, 128, 0.2) 50%);
				background-size: 200% 100%;
				background-position: 100% 0;
				.drag-icon {
					position: absolute;
					top: 0;
					left: 5px;
					width: 25px;
					height: 25px;
					transition: $trans-time;
				}
				&:hover {
					bottom: 0;
					background-position: 0 0;
				}
				&:active {
					.drag-icon {
						transform: translateX(-5px);
					}
				}
				&.reverse {
					.drag-icon {
						transform: scaleX(-1);
					}
					&:active {
						.drag-icon {
							transform: scaleX(-1) translateX(-5px);
						}
					}
				}
			}
		}
		.view-vtk-main {
			width: calc(100% - $left-panel-width-normal);
			margin-left: $left-panel-width-normal;
		}
		.view-vtk-main {
			position: relative;
			height: 100%;
			padding: 0;
			background-color: ivory;
			transition: 0.2s;
			.vtk-view-container {
				position: absolute;
				height: 100%;
				width: 100%;
				.view-aside-menu {
					overflow: hidden;
				}
			}
		}
	}
}

.bg {
	backface-visibility: hidden;
	background-size: 100% 100%;
	background-repeat: no-repeat;
}

.model-buttonGroup {
	position: absolute;
	z-index: 100;
	margin-left: 10px;
	margin-top: 10px;
	-webkit-user-drag: none;

	.bg {
		width: 28px;
		height: 20px;
		margin: 2px;
	}
}

.buttonGroup {
	position: absolute;
	z-index: 100;
	margin-left: 100px;
	margin-top: 10px;

	.bg {
		width: 26px;
		height: 26px;
		margin: 2px;
	}
}

.teeth-buttonGroup {
	position: absolute;
	z-index: 100;
	margin-left: 230px;
	margin-top: 10px;

	.bg {
		width: 26px;
		height: 26px;
		margin: 2px;
	}
}
.slider-block {
	position: absolute;
	z-index: 100;
	margin-left: 400px;
	margin-top: 7px;
	width: 60px;
	align-items: center;
	:deep {
		.el-slider__bar {
			background-color: #f79f89 !important;
		}
		.el-slider__button {
			border-color: #f79f89;
		}
	}
}
.disabled {
	opacity: 0.2;
	pointer-events: none;
}
.activated {
	color: #ffd04b;
	background-color: #434a50;
}
.upper-teeth-icon {
	background-image: url("../assets/Icon_view_upper.png");
}
.lower-teeth-icon {
	background-image: url("../assets/Icon_view_lower.png");
}
.show-upper-teeth-icon {
	background-image: url("../assets/Icon_upper_teeth_show.png");
}
.hide-upper-teeth-icon {
	background-image: url("../assets/Icon_upper_teeth_hide.png");
}
.show-lower-teeth-icon {
	background-image: url("../assets/Icon_lower_teeth_show.png");
}
.hide-lower-teeth-icon {
	background-image: url("../assets/Icon_lower_teeth_hide.png");
}
.left-orient-icon {
	background-image: url("../assets/Icon_view_left.png");
}
.front-orient-icon {
	background-image: url("../assets/Icon_view_front.png");
}
.right-orient-icon {
	background-image: url("../assets/Icon_view_right.png");
}
.icon-icon {
	background-image: url("../assets/Icon_newcase.png");
}
.hide-bracket-icon {
	background-image: url("../assets/Icon_bracket_hide.jpg");
}
.show-bracket-icon {
	background-image: url("../assets/Icon_bracket_show.jpg");
}
.show-bracket-arch-icon {
	background-image: url("../assets/Icon_bracket_arch_show.png");
}
.show-arch-icon {
	background-image: url("../assets/Icon_arch_show.png");
}

.show-teeth-icon {
	background-image: url("../assets/Icon_teeth_show.jpg");
}
.show-gingiva-icon {
	background-image: url("../assets/Icon_gingiva_show.png");
}
.show-teeth-gingiva-icon {
	background-image: url("../assets/Icon_teeth_gingiva_show.jpg");
}
.icon-keyboard {
	background-image: url("../assets/Icon_keyboard.png");
}

.show-axis-icon {
	background-image: url("../assets/Icon_axis_show.jpg");
}
.hide-axis-icon {
	background-image: url("../assets/Icon_axis_hide.jpg");
}
.show-origin-icon {
	background-image: url("../assets/Icon_origin_show.png");
}
.hide-originGingiva-icon {
	background-image: url("../assets/Icon_originGingiva_hide.png");
}
.hide-origin-icon {
	background-image: url("../assets/Icon_origin_hide.png");
}
.model-finetune-icon {
	background-image: url("../assets/Icon_bracket_finetune.png");
}
.model-save-online-icon {
	background-image: url("../assets/Icon_saveOnline.png");
}
.icon-index-icon {
	background-image: url("../assets/Icon_adjust_simulate.png");
}
</style>
<style>
#view .el-checkbox-button__inner {
	padding: 0 5px;
}
#view .model-buttonGroup .el-button {
	padding: 0 5px;
}
#view .buttonGroup .el-button {
	padding: 0 5px;
}
#view .teeth-buttonGroup .el-button {
	padding: 0 5px;
}
</style>
