<!--
 * @Description: 
 * @Version: 1.0
 * @Autor: ZhuYichen
 * @Date: 2023-05-16 15:39:32
 * @LastEditors: ZhuYichen
 * @LastEditTime: 2023-10-23 16:37:37
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
			<div class="handle-title">选择</div>
			<div class="handle-body">
				<div class="half clear-fix">
					<div
						class="teeth-type-button"
						:class="{
							activate: dentalArchAdjustType === 'upper',
							disabled: !arrangeTeethType.includes('upper'),
						}"
						@click="updateDentalArchAdjustType('upper')"
					>
						上颌
					</div>
				</div>
				<div class="half">
					<div
						class="teeth-type-button"
						:class="{
							activate: dentalArchAdjustType === 'lower',
							disabled: !arrangeTeethType.includes('lower'),
						}"
						@click="updateDentalArchAdjustType('lower')"
					>
						下颌
					</div>
				</div>
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
import {
    setTokenHeader,
    setUserIdHeader,
    sendRequestWithToken,
} from "../../utils/tokenRequest";
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
const arrangeTeethType = computed(() => store.getters["userHandleState/arrangeTeethType"]);
const dentalArchAdjustType = computed(() => store.state.actorHandleState.teethArrange.dentalArchAdjustRecord.teethType);

/**
 * @description: 这里直接复用了牙弓线调整面板中的选择模块
 * @param {*} value 上/下颌
 * @return {*}
 * @author: ZhuYichen
 */
function updateDentalArchAdjustType(value) {
	// dentalArchAdjustType.value = value;
	store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
		teethType: value,
	});
}

function resetTeethRoot() {
	if(dentalArchAdjustType.value=='upper'){
		store.dispatch("actorHandleState/updateGenerateRootRecord", {
			upper: false,
		});
	}else if(dentalArchAdjustType.value=='lower'){
		store.dispatch("actorHandleState/updateGenerateRootRecord", {
			lower: false,
		});
	}
}
const generateRootRecord = computed(() => store.state.actorHandleState.generateRootRecord);

function generateTeethRoot() {
	if(dentalArchAdjustType.value=='upper'){
		store.dispatch("actorHandleState/updateGenerateRootRecord", {
			upper: true,
		});
	}else if(dentalArchAdjustType.value=='lower'){
		store.dispatch("actorHandleState/updateGenerateRootRecord", {
			lower: true,
		});
	}
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
