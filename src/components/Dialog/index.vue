<template>
	<div class="dialog-container" :class="{ hide: !isAnyDialogShowing }" @click="changeDialogShowState('all', false)">
		<template v-for="dialogType in ['dataSave', 'dataSubmit']" :key="dialogType">
			<DialogConfirm
				:dialogSetting="dialogSettings[dialogType]"
				:dialogState="dialogStates[dialogType]"
				:changeBoxChecked="
					() => (dialogStates[dialogType].secondaryChecked = !dialogStates[dialogType].secondaryChecked)
				"
				:confirmCallBack="() => confirmEvent(dialogType)"
				:changeShowState="(val) => changeDialogShowState(dialogType, val)"
			/>
		</template>
	</div>
</template>

<script setup>
import DialogConfirm from "./dialogConfirm";
import { computed, reactive, defineProps } from "vue";
import { useStore } from "vuex";
const props = defineProps({
	showMessage: {
		type: Function,
		default: () => {},
	},
	saveCallBack: {
		type: Function,
		default: () => {},
	},
	submitCallBack: {
		type: Function,
		default: () => {},
	},
});
const store = useStore();
let currentProcessType = "";
let dialogStates = reactive({
	dataSave: {
		show: false, // 显示/隐藏
		submit: false, // 在提交操作中不可更改state的状态, 即changeDialogShowState失效
		secondaryChecked: false, // 需要二次确认时使用
	},
	dataSubmit: {
		show: false, // 显示/隐藏
		submit: false, // 在提交操作中不可更改state的状态, 即changeDialogShowState失效
		secondaryChecked: false, // 需要二次确认时使用
	},
});
let dialogSettings = {
	dataSave: {
		title: "方案在线保存",
		content: "该操作仅更新方案！",
		confirm: "是否确认执行该操作？",
		waitingTips: "数据保存中，因牙列数据较大，请耐心等待，在保存完成之前，请勿关闭网页！",
		secondaryConfirm: false, // 是否需要二次确认
	},
	dataSubmit: {
		title: "方案在线递交",
		content: "该操作更新方案并推进方案至下一阶段，一旦确认，方案将被锁定，不可再更改！",
		confirm: "",
		waitingTips: "数据保存中，因牙列数据较大，请耐心等待，在保存完成之前，请勿关闭网页！",
		secondaryConfirm: true, // 是否需要二次确认
	},
};
let isAnyDialogShowing = computed(() => Object.values(dialogStates).some((val) => val.show === true));
let isAnyDialogSubmit = computed(() => Object.values(dialogStates).some((val) => val.submit === true));
function changeDialogShowState(dialogType, val) {
	if (isAnyDialogSubmit.value) {
		// 有某个对话框正在执行动作时不能改变状态
		props.showMessage("请等待当前操作执行完成......", "warning");
		return;
	}
	if (dialogType === "all") {
		Object.keys(dialogStates).forEach((k) => {
			dialogStates[k].show = val;
			dialogStates[k].secondaryChecked = false;
		});
	} else {
		dialogStates[dialogType].show = val;
		dialogStates[dialogType].secondaryChecked = false;
	}
}

function confirmEvent(confirmType) {
	if (store.getters["userHandleState/uploadType"].length === 0) {
		// 所有数据已递交 / 无牙齿模型加载完成, 后者不会发生
		props.showMessage("该数据已递交, 无法继续修改", "error");
		return;
	}
	currentProcessType = confirmType;
	dialogStates[confirmType].submit = true;
	switch (confirmType) {
		case "dataSave":
			props.saveCallBack();
			break;
		case "dataSubmit":
			props.submitCallBack();
			break;
	}
}

function finishProcess() {
	dialogStates[currentProcessType].submit = false;
	dialogStates[currentProcessType].show = false;
}

defineExpose({changeDialogShowState, isAnyDialogSubmit, finishProcess})
</script>

<style lang="scss" scoped>
.dialog-container {
	background-color: rgba(128, 128, 128, 0.4);
	position: fixed;
	top: 0;
	left: 0;
	z-index: 200;
	width: 100%;
	height: 100%;
	transition: 0.1s;
	&.hide {
		opacity: 0;
		visibility: hidden;
	}
}
</style>
