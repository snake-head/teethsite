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
									<el-input-number
										id="pan-step"
										v-model.number="adjustStep"
										:step="0.01"
										controls-position="right"
									/>
									<span class="unit-text">mm</span>
								</div>
							</div>
							<div class="item-line">
								<div class="col-18 adjust-step">
									<label for="rot-step">旋转: </label>
									<el-input-number
										id="rot-step"
										v-model.number="adjustAngle"
										:step="1.0"
										controls-position="right"
									/>
									<span class="unit-text">度</span>
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
									<div class="adjust-button enter-button" @click="updateCurrentMode('straightenSimulation', true)">
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
							<div>
								<div class="check-toggle" @click="toggleDataSaveCheckbox()" v-if="userInfo.isRollBackAuthorized">
									<input type="checkbox" :checked="isAnyDataCheckable" class="model-save-checkbox"/>
									<span>方案已确认</span>
								</div>
								<div class="title clickable" @click="newDataSaveWithCheckable()">
									<div class="bg model-save-online-icon asidemenu-icon" />
									<span>方案在线保存</span>
								</div>
							</div>
							<div class="title clickable" @click="dialog.changeDialogShowState('dataSubmit', true)">
								<div class="bg model-upload-online-icon asidemenu-icon" />
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

const isAnyDataCheckable = computed(() => store.getters["userHandleState/isAnyDataCheckable"]); 

/**
 * @description: 修改checkable的状态，表明本次保存是否是已确认的
 * @return {*}
 * @author: ZhuYichen
 */
function toggleDataSaveCheckbox(){
	const flag = !isAnyDataCheckable.value
	for(let teethType of ['upper', 'lower']){
		store.dispatch("userHandleState/updateDataCheckableState", {
			teethType,
			value: flag,
		});
	}
}

/**
 * @description: 2023.9.8更新：点击保存时需要发送两个请求，一个是保存数据，一个是修改是否确认的标志位
 * @return {*}
 * @author: ZhuYichen
 */
function newDataSaveWithCheckable(){
	dialog.value.changeDialogShowState('dataSave', true)
	viewerMain.value.setDataCheckable()
}

</script>

<style lang="scss" scoped>
@import './viewerStyle.scss';
</style>
