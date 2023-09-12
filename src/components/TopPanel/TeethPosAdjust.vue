<template>
	<div class="main-block panel" :class="{ show: isShow }">
		<div class="title-box">
			<div class="text">
				<div class="bg icon-finetune" />
				<span>{{ isTeethPositionAdjustFree ? "咬合位置" : "计算中..." }}</span>
			</div>
			<div class="exit">
				<div class="icon-exit bg" @click="exitToolPanel()" />
				<div
					class="bg icon-keyboard"
					:class="{ activate: selectKeyBoardEvent === 'teethpos' }"
					@click="switchSelectKeyBoardEvent()"
				/>
				<div class="icon-switch bg" @click="switchToolPanel()" />
			</div>
		</div>
		<div class="handle-box" :class="{ deactivate: !isTeethPositionAdjustFree }">
			<div class="handle-title">选择</div>
			<div class="handle-body">
				<div class="half clear-fix">
					<div
						class="teeth-type-button"
						:class="{ activate: teethPositionAdjustType === 'upper' }"
						@click="updateTeethPositionAdjustType('upper')"
					>
						上颌
					</div>
				</div>
				<div class="half">
					<div
						class="teeth-type-button"
						:class="{ activate: teethPositionAdjustType === 'lower' }"
						@click="updateTeethPositionAdjustType('lower')"
					>
						下颌
					</div>
				</div>
			</div>
		</div>
		<div class="handle-box" :class="{ deactivate: !isTeethPositionAdjustFree }">
			<div class="handle-title">设置</div>
			<div class="handle-body">
				<div class="half clear-fix">
					<div class="adjust-step">
						<label for="pan-step-teeth-position">平移： </label>
						<input
							id="pan-step-teeth-position"
							type="number"
							step="0.01"
							v-model.number="teethPositionAdjustStep"
						/>mm
					</div>
				</div>
				<div class="half clear-fix">
					<div class="adjust-step">
						<label for="rot-step-teeth-position">旋转： </label>
						<input
							id="rot-step-teeth-position"
							type="number"
							step="1.0"
							v-model.number="teethPositionAdjustAngle"
						/>度
					</div>
				</div>
			</div>
		</div>
		<div class="handle-box" :class="{ deactivate: !isTeethPositionAdjustFree }">
			<div class="handle-title">平移</div>
			<div class="handle-body">
				<div class="half clear-fix">
					<div class="adjust-button" @click="updateTeethPositionAdjustMoveType('OUTWARD')">
						<div class="out-text" />
						<div class="keybind-text" :class="{ show: isKeyBoardEventSelected }">
							0
						</div>
					</div>
					<div class="adjust-button" @click="updateTeethPositionAdjustMoveType('UP')">
						<div class="up-text" />
					</div>
					<div class="adjust-button" @click="updateTeethPositionAdjustMoveType('INWARD')">
						<div class="in-text" />
						<div class="keybind-text" :class="{ show: isKeyBoardEventSelected }">
							.
						</div>
					</div>
				</div>
				<div class="half clear-fix">
					<div class="adjust-button" @click="updateTeethPositionAdjustMoveType('LEFT')">
						<div class="left-text" />
					</div>
					<div class="adjust-button" @click="updateTeethPositionAdjustMoveType('DOWN')">
						<div class="down-text" />
					</div>
					<div class="adjust-button" @click="updateTeethPositionAdjustMoveType('RIGHT')">
						<div class="right-text" />
					</div>
				</div>
			</div>
		</div>
		<div class="handle-box" :class="{ deactivate: !isTeethPositionAdjustFree }">
			<div class="handle-title">旋转</div>
			<div class="handle-body">
				<div class="half clear-fix">
					<div class="adjust-button" @click="updateTeethPositionAdjustMoveType('XALONG')">
						<div class="bg icon-rot-up" />
						<div class="keybind-text" :class="{ show: isKeyBoardEventSelected }">
							8
						</div>
					</div>
					<div class="adjust-button" @click="updateTeethPositionAdjustMoveType('YALONG')">
						<div class="bg icon-rot-ctclockwise" />
						<div class="keybind-text" :class="{ show: isKeyBoardEventSelected }">
							7
						</div>
					</div>
					<div class="adjust-button" @click="updateTeethPositionAdjustMoveType('ZALONG')">
						<div class="bg icon-rot-left" />
						<div class="keybind-text" :class="{ show: isKeyBoardEventSelected }">
							4
						</div>
					</div>
				</div>
				<div class="half clear-fix">
					<div class="adjust-button" @click="updateTeethPositionAdjustMoveType('XANTI')">
						<div class="bg icon-rot-down" />
						<div class="keybind-text" :class="{ show: isKeyBoardEventSelected }">
							2
						</div>
					</div>
					<div class="adjust-button" @click="updateTeethPositionAdjustMoveType('YANTI')">
						<div class="bg icon-rot-clockwise" />
						<div class="keybind-text" :class="{ show: isKeyBoardEventSelected }">
							9
						</div>
					</div>
					<div class="adjust-button" @click="updateTeethPositionAdjustMoveType('ZANTI')">
						<div class="bg icon-rot-right" />
						<div class="keybind-text" :class="{ show: isKeyBoardEventSelected }">
							6
						</div>
					</div>
				</div>
			</div>
		</div>
		<!-- 2023.1.10更新：给咬合调整添加一个临时状态保存和重置到上一保存点的功能，因此把原来的
		重置按钮更名为初始化按钮，并调整几个按钮的位置 -->
		<div class="handle-box" :class="{ deactivate: !isTeethPositionAdjustFree }">
			<div class="handle-title">一键咬合</div>
			<div class="handle-body">
				<div class="half clear-fix">
					<div class="handle-btn teeth-type-button" @click="updateTeethPositionAdjustMoveType('ZBITE')">
						上下咬合
					</div>
				</div>
				<div class="half clear-fix">
					<div class="handle-btn teeth-type-button" @click="updateTeethPositionAdjustMoveType('YBITE')">
						前后咬合
					</div>
				</div>
			</div>
		</div>
		<!-- 添加状态操作栏，包含重置和保存两个功能 -->
		<div class="handle-box" :class="{ deactivate: !isTeethPositionAdjustFree }">
			<div class="handle-title">状态操作</div>
			<div class="handle-body">
				<div class="half clear-fix">
					<div class="handle-btn teeth-type-button" @click="updateTeethPositionAdjustMoveType('TEMPSAVE')">
						保存
					</div>
				</div>
				<div class="half clear-fix">
					<div class="handle-btn teeth-type-button" @click="updateTeethPositionAdjustMoveType('TEMPRESET')">
						重置
					</div>
				</div>
			</div>
		</div>
		<div class="handle-box" :class="{ deactivate: !isTeethPositionAdjustFree }">
			<div class="handle-title">初始化</div>
			<div class="handle-body">
				<div class="half clear-fix">
					<button class="handle-btn teeth-type-button" @click="updateTeethPositionAdjustMoveType('RESET')">
						初始化
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
import { useStore } from "vuex";
import { computed, watch, defineProps } from "vue";
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
const store = useStore();
const teethPositionAdjustType = computed(() => store.state.actorHandleState.teethPositionAdjust.teethType);
const teethPositionAdjustStep = computed({
	get() {
		return store.state.actorHandleState.teethPositionAdjust.step;
	},
	set(value) {
		store.dispatch("actorHandleState/updateTeethPositionAdjustStep", value);
	},
});
const teethPositionAdjustAngle = computed({
	get() {
		return store.state.actorHandleState.teethPositionAdjust.angle;
	},
	set(value) {
		store.dispatch("actorHandleState/updateTeethPositionAdjustAngle", value);
	},
});
function updateTeethPositionAdjustType(value) {
	store.dispatch("actorHandleState/updateTeethPositionAdjustType", value);
}
const teethPositionAdjustMoveType = computed(() => store.state.actorHandleState.teethPositionAdjustMoveType);
const isTeethPositionAdjustFree = computed(() => teethPositionAdjustMoveType.value === "");
function updateTeethPositionAdjustMoveType(value) {
	if (teethPositionAdjustMoveType.value === "") {
		store.dispatch("actorHandleState/updateTeethPositionAdjustMoveType", value);
	}
}
const selectKeyBoardEvent = computed(() => store.state.actorHandleState.selectKeyBoardEvent);
const isKeyBoardEventSelected = computed(() => selectKeyBoardEvent.value === "teethpos");
function switchSelectKeyBoardEvent() {
	store.dispatch(
		"actorHandleState/updateSelectKeyBoardEvent",
		selectKeyBoardEvent.value !== "teethpos" ? "teethpos" : ""
	);
}
watch(selectKeyBoardEvent, (newVal, oldVal) => {
	if (oldVal === "teethpos") {
		document.removeEventListener("keydown", throttleKeyControlTeethPosFineTune);
		window.removeEventListener(
			"keydown",
			preventScroll // 防止触发方向键默认滚动事件
		);
	}
	if (newVal === "teethpos") {
		document.addEventListener("keydown", throttleKeyControlTeethPosFineTune);
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
const throttleKeyControlTeethPosFineTune = throttle(keyControlTeethPosFineTune, 30);
function keyControlTeethPosFineTune(event) {
	switch (event.key) {
		case "ArrowUp": {
			updateTeethPositionAdjustMoveType("UP");
			break;
		}
		case "ArrowDown": {
			updateTeethPositionAdjustMoveType("DOWN");
			break;
		}
		case "ArrowLeft": {
			updateTeethPositionAdjustMoveType("LEFT");
			break;
		}
		case "ArrowRight": {
			updateTeethPositionAdjustMoveType("RIGHT");
			break;
		}
		case "0": {
			updateTeethPositionAdjustMoveType("OUTWARD");
			break;
		}
		case ".": {
			updateTeethPositionAdjustMoveType("INWARD");
			break;
		}
		case "8": {
			updateTeethPositionAdjustMoveType("XALONG");
			break;
		}
		case "2": {
			updateTeethPositionAdjustMoveType("XANTI");
			break;
		}
		case "4": {
			updateTeethPositionAdjustMoveType("ZALONG");
			break;
		}
		case "6": {
			updateTeethPositionAdjustMoveType("ZANTI");
			break;
		}
		case "7": {
			updateTeethPositionAdjustMoveType("YALONG");
			break;
		}
		case "9": {
			updateTeethPositionAdjustMoveType("YANTI");
			break;
		}
	}
}
</script>

<style lang="scss" scoped>
@import "panelStyle.scss";
</style>
