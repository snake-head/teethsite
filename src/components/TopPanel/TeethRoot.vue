<!--
 * @Description: 
 * @Version: 1.0
 * @Autor: ZhuYichen
 * @Date: 2023-05-16 15:39:32
 * @LastEditors: ZhuYichen
 * @LastEditTime: 2023-05-31 16:57:27
-->
<template>
	<div class="main-block panel" :class="{ show: isShow }">
		<div class="title-box">
			<div class="text">
				<div class="bg icon-finetune" />
				<span>虚拟牙根</span>
			</div>
			<div class="exit">
				<div class="icon-exit bg" @click="exitToolPanel()" />
			</div>
		</div>
		<div class="handle-box">
			<div class="handle-title">生成牙根</div>
			<div class="handle-body">
				<div class="half clear-fix">
					<button
						class="handle-btn teeth-type-button"
						@click="generateTeethRoot()"
					>
						生成
					</button>
				</div>
			</div>
		</div>
		<div class="handle-box">
			<div class="handle-title">状态操作</div>
			<div class="handle-body">
				<div class="half clear-fix">
					<button
						class="handle-btn teeth-type-button"
						:class="{ disabled: !canUserSaveAdjustRecord }"
						@click="saveTeethRootRecord()"
					>
						保存
					</button>
				</div>
				<div class="half clear-fix">
					<button class="handle-btn teeth-type-button" @click="resetTeethRoot()">
						重置
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
const props = defineProps({
	isShow: {
		type: Boolean,
		default: false,
	},
	exitToolPanel: {
		type: Function,
		default: () => {},
	},
});

const store = useStore();
const dentalArchAdjustType = computed(() => store.state.actorHandleState.teethArrange.dentalArchAdjustRecord.teethType);

function resetTeethRoot() {
	store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
		[dentalArchAdjustType.value]: { reset: true },
	});
}

function generateTeethRoot() {
	console.log('生成牙根')
}

const canUserSaveAdjustRecord = computed(() => store.getters["actorHandleState/canUserSaveAdjustRecord"]);

function saveTeethRootRecord() {
	// 保存参数, 覆盖牙弓线和bracketMatrix
	store.dispatch("actorHandleState/saveDentalArchAdjustRecord");
}

</script>

<style lang="scss" scoped>
@import "panelStyle.scss";
</style>
