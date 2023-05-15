<template>
	<div class="main-block panel" :class="{ show: isShow }">
		<div class="title-box">
			<div class="text">
				<div class="bg icon-finetune" />
				<span>牙弓线调整</span>
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
			<div class="handle-title">排牙</div>
			<div class="handle-body">
				<div class="half clear-fix">
					<!-- <button
						class="handle-btn teeth-type-button"
						:class="{ disabled: isArrangedOnLatestAdjustDentalArch }"
						@click="updateTeethArrange()"
					> -->
					<button
						class="handle-btn teeth-type-button"
						@click="updateTeethArrange()"
					>
						更新
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
						@click="saveAdjustRecord()"
					>
						保存
					</button>
				</div>
				<div class="half clear-fix">
					<button class="handle-btn teeth-type-button" @click="resetDentalArch()">
						重置
					</button>
				</div>
			</div>
		</div>
		<div class="handle-box">
			<div class="handle-title">初始化</div>
			<div class="handle-body">
				<div class="half clear-fix">
					<button
						class="handle-btn teeth-type-button"
						:class="{ disabled: !isReinitActivate }"
						@click="resetDentalArchToInitState()"
					>
						初始化
					</button>
				</div>
			</div>
		</div>

		<!-- <div class="handle-box">
			<div class="handle-title">导出</div>
			<div class="handle-body">
				<div class="half clear-fix">
					<button class="handle-btn teeth-type-button" @click="exportDentalArchCoefficients()">
						导出
					</button>
				</div>
				<div class="half clear-fix">
					<button
						class="handle-btn teeth-type-button"
						:class="{ disabled: selectIndex === -1 }"
						@click="importDentalArchCoefficients()"
					>
						导入
					</button>
				</div>
			</div>
		</div>
		<div class="handle-box">
			<div class="handle-title">导入</div>
			<div class="handle-body expand-list">
				<ul>
					<li
						:class="{ selected: selectIndex === index }"
						v-for="({ time }, index) in importDentalArchRecords"
						:key="index"
						@click="selectImportRecords(index)"
					>
						{{ time }}
					</li>
				</ul>
			</div>
		</div> -->
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
	checkArchUpdated: {
		type: Function,
		default: ()=> {},
	}
});

const store = useStore();
const dentalArchParams = computed(() => ({
	upper: store.state.actorHandleState.teethArrange.dentalArchSettings.upper.coEfficients,
	lower: store.state.actorHandleState.teethArrange.dentalArchSettings.lower.coEfficients,
}));
watch(dentalArchParams, () => {
	let text = {};
	for (let teethType of ["upper", "lower"]) {
		if (dentalArchParams.value[teethType]) {
			text[teethType] = "";
			for (let exp = 4; exp >= 0; exp--) {
				if (dentalArchParams.value[teethType][exp][0] !== 0) {
					let n = dentalArchParams.value[teethType][exp][0];
					let z = 0;
					while (Math.abs(n) < 1) {
						n *= 10;
						z++;
					}
					text[teethType] += `${exp === 4 ? "" : " + "}${dentalArchParams.value[teethType][exp][0].toFixed(
						z + 2
					)}${exp === 0 ? "" : "x" + exp}`;
				}
			}
		}
	}
});
const arrangeTeethType = computed(() => store.getters["userHandleState/arrangeTeethType"]);
const dentalArchAdjustType = computed(() => store.state.actorHandleState.teethArrange.dentalArchAdjustRecord.teethType);

function updateDentalArchAdjustType(value) {
	// dentalArchAdjustType.value = value;
	store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
		teethType: value,
	});
}

function resetDentalArch() {
	store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
		[dentalArchAdjustType.value]: { reset: true },
	});
}

const isArrangedOnLatestAdjustDentalArch = computed(
	() => store.getters["actorHandleState/isArrangedOnLatestAdjustDentalArch"]
);

const showAndHide = inject('showAndHide')
function updateTeethArrange() {
	if (!isArrangedOnLatestAdjustDentalArch.value) {
		store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
			[dentalArchAdjustType.value]: { reArrange: true },
			//2023.1.5更新：添加一个clickFlag，用来表明是点击“更新”键
			clickFlag: true,
		});
	}
	props.checkArchUpdated();
	showAndHide();
}

const canUserSaveAdjustRecord = computed(() => store.getters["actorHandleState/canUserSaveAdjustRecord"]);

function saveAdjustRecord() {
	// 保存参数, 覆盖牙弓线和bracketMatrix
	store.dispatch("actorHandleState/saveDentalArchAdjustRecord");
}

const STORAGE_KEY = "ON_STORE_D_R_REC";
function exportDentalArchCoefficients() {
	// 读取coefficients
	let dentalArchCoefficients = toRaw(dentalArchParams.value[dentalArchAdjustType.value]);
	let saveItem = {
		TIME: Date.now(),
		USER_HANDLE_STATE: dentalArchCoefficients,
	};

	// 存入localStorage中
	// 初始为null
	let currRec = JSON.parse(localStorage.getItem(STORAGE_KEY));
	if (!currRec) {
		currRec = [saveItem];
	} else {
		currRec.push(saveItem);
	}
	localStorage.setItem(STORAGE_KEY, JSON.stringify(currRec));
	let { TIME, USER_HANDLE_STATE } = saveItem;
	let t = new Date(TIME);
	importDentalArchRecords.push({
		time: `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()} ${t
			.getHours()
			.toString()
			.padStart(2, 0)}:${t
			.getMinutes()
			.toString()
			.padStart(2, 0)}:${t
			.getSeconds()
			.toString()
			.padStart(2, 0)}`,
		params: USER_HANDLE_STATE,
	});
}

const importDentalArchRecords = reactive([]);
const selectIndex = ref(-1);
function selectImportRecords(index) {
	// 再次点击重置
	selectIndex.value = selectIndex.value === index ? -1 : index;
}
onMounted(() => {
	const dentalArchRecord = JSON.parse(localStorage.getItem(STORAGE_KEY));
	if (dentalArchRecord) {
		let len = dentalArchRecord.length;
		for (let i = 0; i < len; i++) {
			let { TIME, USER_HANDLE_STATE } = dentalArchRecord[i];
			let t = new Date(TIME);
			importDentalArchRecords.push({
				time: `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()} ${t
					.getHours()
					.toString()
					.padStart(2, 0)}:${t
					.getMinutes()
					.toString()
					.padStart(2, 0)}:${t
					.getSeconds()
					.toString()
					.padStart(2, 0)}`,
				params: USER_HANDLE_STATE,
			});
		}
	}
});

function importDentalArchCoefficients() {
	// 覆盖牙弓线系数
	store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
		regenerate: true,
		[dentalArchAdjustType.value]: {
			coEfficients: toRaw(importDentalArchRecords[selectIndex.value]).params,
		},
	});
}
const isReinitActivate = computed(
	() =>
		store.state.actorHandleState.teethArrange.dentalArchAdjustRecord[
			store.state.actorHandleState.teethArrange.dentalArchAdjustRecord.teethType
		].isReinitActivate
);
// 完全重置, 进行一次[排牙]重新计算牙弓线
function resetDentalArchToInitState() {
	if (isReinitActivate.value) {
		store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
			[dentalArchAdjustType.value]: {
				reArrangeToInitState: true, // viewerMain中触发监听后, forceUpdateArrange
				isReinitActivate: false, // 点一次[初始化]以后设置为不可点击
			},
		});
	}
}
</script>

<style lang="scss" scoped>
@import "panelStyle.scss";
</style>
