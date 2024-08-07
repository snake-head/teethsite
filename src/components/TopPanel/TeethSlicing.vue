<template>
	<div class="main-block panel" :class="{ show: isShow }">
		<div class="title-box">
			<div class="text">
				<div class="bg icon-finetune" />
				<span>牙齿切片</span>
			</div>
			<div class="exit">
				<div class="icon-exit bg" @click="exitToolPanel()" />
				<div
					class="bg icon-keyboard"
					:class="{ activate: selectKeyBoardEvent === 'boxpos' }"
					@click="switchSelectKeyBoardEvent()"
				/>
				<div class="icon-switch bg" @click="switchToolPanel()" />
			</div>
		</div>
		<div class="handle-box">
			<div class="handle-title">包围框选择</div>
			<div class="handle-body">
				<div class="half clear-fix">
					<div
						class="tooth-selection-button"
						:class="{
							activate: availableToothSides === 'left',
							disabled: availableToothSides === '',
							// 小尾巴：设置在进入该功能后该值不为空，退出该功能后该值为空
						}"
						style="display: inline-block;"
						@click="updateBoxPositionAdjustType('left')"	
					>
						左侧
					</div>
					<div
						class="tooth-selection-button"
						:class="{
							activate: availableToothSides === 'right',
							disabled: availableToothSides === '',
							// 小尾巴：设置在进入该功能后该值不为空，退出该功能后该值为空
						}"
						style="display: inline-block;"
						@click="updateBoxPositionAdjustType('right')"
					>
						右侧
					</div>
				</div>
				<div class="half clear-fix" :class="{ deactivate: !isBoxPositionAdjustFree }">
					<div class="adjust-button" @click="updateBoxPositionAdjustMoveType('LEFT')">
						<div class="left-text" />
					</div>
					<div class="adjust-button" @click="updateBoxPositionAdjustMoveType('RIGHT')">
						<div class="right-text" />
					</div>
				</div>
			</div>
		</div>
        <div class="handle-box">
			<div class="handle-title">设置</div>
			<div class="handle-body">
				<div class="half clear-fix">
					<div class="adjust-step">
						<!-- <label for="pan-step-box-position">平移： </label> -->
						<input
							id="pan-step-box-position"
							type="number"
							step="1"
							v-model.number="boxPositionAdjustStep"
						/>
						<span class="unit-text special" style="color: black;">mm</span>
					</div>
				</div>
			</div>
		</div>
		<div class="handle-box">
			<div class="handle-title">状态操作</div>
			<div class="handle-body">
				<div class="half clear-fix">
					<button class="handle-btn tooth-selection-button" @click="saveTeethBoxRecord()">
						保存
					</button>
				</div>
				<div class="half clear-fix">
					<button class="handle-btn tooth-selection-button" @click="generateTeethBoxRecord('TEMPRESET')">
						重置
					</button>
				</div>
			</div>
		</div>
		<div class="handle-box">
			<div class="handle-title">初始化</div>
			<div class="handle-body">
				<div class="half clear-fix">
					<button class="handle-btn tooth-selection-button" @click="generateTeethBoxRecord('RESET')">
						初始化
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
import { useStore } from "vuex";
import { reactive, ref, toRaw, computed, watch, onMounted, defineProps, inject } from "vue";
import ViewerMain from "../ViewerComponent/ViewerMain.vue";
import Viewer from "../../pages/Viewer.vue"
import {
    setTokenHeader,
    setUserIdHeader,
    sendRequestWithToken,
} from "../../utils/tokenRequest";
import { throttle } from "@kitware/vtk.js/macro";
defineProps({
	isShow: {
		type: Boolean,
		default: false,
	},
	exitToolPanel: {
		type: Function,
		default: () => {},
	},
	switchToolPanel: {
		type: Function,
		default: () => {},
	},
});

function generateTeethBoxRecord(value){
	store.dispatch("actorHandleState/updateBoxPositionAdjustMoveType", value);
}

const store = useStore();

const availableToothSides = computed(() => store.state.actorHandleState.BoxSlicing.availableToothSides.face);

const selectKeyBoardEvent = computed(() => store.state.actorHandleState.selectKeyBoardEvent);
const isKeyBoardEventSelected = computed(() => selectKeyBoardEvent.value === "boxpos");
function switchSelectKeyBoardEvent() {
	store.dispatch(
		"actorHandleState/updateSelectKeyBoardEvent",
		selectKeyBoardEvent.value !== "boxpos" ? "boxpos" : ""
	);
}
watch(selectKeyBoardEvent, (newVal, oldVal) => {
	if (oldVal === "boxpos") {
		document.removeEventListener("keydown", throttleKeyControlBoxFineTune);
		window.removeEventListener(
			"keydown",
			preventScroll // 防止触发方向键默认滚动事件
		);
	}
	if (newVal === "boxpos") {
		document.addEventListener("keydown", throttleKeyControlBoxFineTune);
		window.addEventListener(
			"keydown",
			preventScroll // 防止触发方向键默认滚动事件
		);
	}
});
function preventScroll(event) {
	switch (event.key) {
		case "ArrowLeft":
		case "ArrowRight":
		case " ":
			event.preventDefault();
			break;
		default:
			break;
	}
}
const throttleKeyControlBoxFineTune = throttle(keyControlBoxFineTune, 30);
function keyControlBoxFineTune(event) {
	switch (event.key) {
		case "ArrowLeft": {
			updateBoxPositionAdjustMoveType("LEFT");
			// fineTuneBoxPosition("left");
			break;
			// （理论上）左面只能向右调整，右面只能向左调整（未写死）
		}
		case "ArrowRight": {
			updateBoxPositionAdjustMoveType("RIGHT");
			// fineTuneBoxPosition("right");
			break;
		}
	}
}


// 键盘移动传递参数
const boxPositionAdjustMoveType = computed(() => store.state.actorHandleState.BoxSlicing.boxPositionAdjustMoveType);
const isBoxPositionAdjustFree = computed(() => boxPositionAdjustMoveType.value === "");
const boxPositionAdjustType = computed(() => store.state.actorHandleState.BoxSlicing.boxPositionAdjust.faceType);

const boxPositionAdjustStep = computed({
	get() {
		return store.state.actorHandleState.BoxSlicing.boxPositionAdjust.step;
	},
	set(value) {
		store.dispatch("actorHandleState/updateBoxPositionAdjustStep", value);
	},
});

function updateBoxPositionAdjustType(value) {
	store.dispatch("actorHandleState/updateavailableToothSides", value);
	store.dispatch("actorHandleState/updateBoxPositionAdjustType", value);
}

function updateBoxPositionAdjustMoveType(value) {
	if (boxPositionAdjustMoveType.value === "") {
		store.dispatch("actorHandleState/updateBoxPositionAdjustMoveType", value);
	}
}

function saveTeethBoxRecord0(){
	const SurroundingBoxPoints = store.state.actorHandleState.BoxSlicing.BoxPoints;
	store.dispatch("actorHandleState/updateTuneBoxs", SurroundingBoxPoints);
	console.log('存储结果', SurroundingBoxPoints);
}

/**
 * Function：记录此时的包围框坐标，并生成分割后的牙齿
 */
function saveTeethBoxRecord(){
	const currentSelectBracketName = store.state.actorHandleState.currentSelectBracketName;
	const SurroundingBoxPoints = store.state.actorHandleState.BoxSlicing.BoxPoints;
	const toothBoxPoints = {};
	toothBoxPoints[currentSelectBracketName] = {
		Point0: SurroundingBoxPoints.Point0,
		Point1: SurroundingBoxPoints.Point1,
		Point2: SurroundingBoxPoints.Point2,
		Point3: SurroundingBoxPoints.Point3,
		Point4: SurroundingBoxPoints.Point4,
		Point5: SurroundingBoxPoints.Point5,
		Point6: SurroundingBoxPoints.Point6,
		Point7: SurroundingBoxPoints.Point7,
	}
	// store.dispatch("actorHandleState/updateTuneBoxs", SurroundingBoxPoints);
	store.dispatch("actorHandleState/updateToothBoxPoints",toothBoxPoints)
	generateTeethBoxRecord('Generate');
}


</script>

<style lang="scss" scoped>
@import "panelStyle.scss";
</style>
