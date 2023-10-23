<template>
	<!-- 动态加载主题 -->
	<div :class="themeType">
		<!-- 由于部分样式必须修改html代码，所以下面的两个view-head实际上是同一套代码，只是元素的排布不同。可能有更好的实现方法。 -->
		<div class="view-head" v-if="themeType=='origin'">
			<el-row class="head-line">
				<el-col :span="currentShowPanel === -1 ? 1 : 0" class="title-block">
					<div class="icon-icon bg" />
				</el-col>
				<el-col :span="currentShowPanel === -1 ? 5 : 0" class="title-block">
					<ul class="normal-info">
						<li>病人姓名: {{ patientName }}</li>
						<li>
							数据状态:
							<span class="data-state-info" :class="uploadType.length === 0 ? 'done' : 'doing'">
								{{ dataState }}
							</span>
						</li>
					</ul>
				</el-col>
				<el-col :span="currentShowPanel === -1 ? 18 : 24" class="title-block no-margin over-vis">
					<ToolMenu v-if="isManager"
						:isShow="!arrangeShowState.isShow && currentShowPanel === -1"
						:toolMenuList="toolMenuList"
						:enterToolPanel="enterToolPanel"
					/>
					<TeethPosAdjust v-if="isManager"
						:isShow="!arrangeShowState.isShow && currentShowPanel === 0"
						:exitToolPanel="exitToolPanel"
						:switchToolPanel="switchToolPanel"
					/>
					<DentalArchAdjust v-if="isManager"
						:isShow="!arrangeShowState.isShow && currentShowPanel === 1"
						:exitToolPanel="exitToolPanel"
						:checkArchUpdated="checkArchUpdated"
						:switchToolPanel="switchToolPanel"
					/>
					<TeethRoot v-if="isManager"
						:isShow="!arrangeShowState.isShow && currentShowPanel === 2"
						:exitToolPanel="exitToolPanel"
					/>
					<div class="main-block progress" :class="{ show: arrangeShowState.isShow }">
						<div class="arrange-progress-bar">
							<el-dual-progress
								textSize="12"
								:percentage1="arrangeShowState.UL.percentage"
								:percentage2="arrangeShowState.UR.percentage"
								:status="
									`${
										arrangeShowState.UL.percentage === 100 && arrangeShowState.UR.percentage
											? 'success'
											: ''
									}`
								"
							>
								<template #left-text>
									<span>{{ arrangeShowState.UL.text }}</span>
								</template>
								<template #right-text>
									<span>{{ arrangeShowState.UR.text }}</span>
								</template>
							</el-dual-progress>
						</div>
						<div class="arrange-progress-bar">
							<el-dual-progress
								textSize="12"
								:percentage1="arrangeShowState.LL.percentage"
								:percentage2="arrangeShowState.LR.percentage"
								:status="
									`${
										arrangeShowState.LL.percentage === 100 && arrangeShowState.LR.percentage
											? 'success'
											: ''
									}`
								"
							>
								<template #left-text>
									<span>{{ arrangeShowState.LL.text }}</span>
								</template>
								<template #right-text>
									<span>{{ arrangeShowState.LR.text }}</span>
								</template>
							</el-dual-progress>
						</div>
					</div>
				</el-col>
			</el-row>
		</div>
		<div class="view-head" v-if="themeType=='new'">
			<el-row class="head-line">
				<el-col :span="currentShowPanel === -1 ? 3 : 0" class="title-block">
					<div class="icon-icon bg" />
				</el-col>
				<el-col :span="currentShowPanel === -1 ? 6 : 0" class="title-block info-block">
					<div class="normal-info">
						<span class="info-text">病人姓名: {{ patientName }}</span>
						<span class="data-text">数据状态:</span>
						<span class="data-state-info" :class="uploadType.length === 0 ? 'done' : 'doing'">
							{{ dataState }}
						</span>
					</div>
				</el-col>
				<el-col :span="currentShowPanel === -1 ? 15 : 24" class="title-block no-margin over-vis">
					<ToolMenu v-if="isManager"
						:isShow="!arrangeShowState.isShow && currentShowPanel === -1"
						:toolMenuList="toolMenuList"
						:enterToolPanel="enterToolPanel"
					/>
					<TeethPosAdjust v-if="isManager"
						:isShow="!arrangeShowState.isShow && currentShowPanel === 0"
						:exitToolPanel="exitToolPanel"
						:switchToolPanel="switchToolPanel"
					/>
					<DentalArchAdjust v-if="isManager"
						:isShow="!arrangeShowState.isShow && currentShowPanel === 1"
						:exitToolPanel="exitToolPanel"
						:checkArchUpdated="checkArchUpdated"
						:switchToolPanel="switchToolPanel"
					/>
					<TeethRoot v-if="isManager"
						:isShow="!arrangeShowState.isShow && currentShowPanel === 2"
						:exitToolPanel="exitToolPanel"
					/>
					<div class="main-block progress" :class="{ show: arrangeShowState.isShow }">
						<div class="arrange-progress-bar">
							<el-dual-progress
								textSize="12"
								:percentage1="arrangeShowState.UL.percentage"
								:percentage2="arrangeShowState.UR.percentage"
								:status="
									`${
										arrangeShowState.UL.percentage === 100 && arrangeShowState.UR.percentage
											? 'success'
											: ''
									}`
								"
							>
								<template #left-text>
									<span>{{ arrangeShowState.UL.text }}</span>
								</template>
								<template #right-text>
									<span>{{ arrangeShowState.UR.text }}</span>
								</template>
							</el-dual-progress>
						</div>
						<div class="arrange-progress-bar">
							<el-dual-progress
								textSize="12"
								:percentage1="arrangeShowState.LL.percentage"
								:percentage2="arrangeShowState.LR.percentage"
								:status="
									`${
										arrangeShowState.LL.percentage === 100 && arrangeShowState.LR.percentage
											? 'success'
											: ''
									}`
								"
							>
								<template #left-text>
									<span>{{ arrangeShowState.LL.text }}</span>
								</template>
								<template #right-text>
									<span>{{ arrangeShowState.LR.text }}</span>
								</template>
							</el-dual-progress>
						</div>
					</div>
				</el-col>
			</el-row>
		</div>
	</div>
	
</template>

<script setup>
import { computed, watch, ref, onMounted } from "vue";
import { useStore } from "vuex";
import ElDualProgress from "../progress";
import TeethPosAdjust from "./TeethPosAdjust.vue";
import ToolMenu from "./ToolMenu.vue";
import DentalArchAdjust from "./DentalArchAdjust.vue";
import TeethRoot from "./TeethRoot.vue"

const store = useStore();
const isManager = computed(() => 
	store.state.userHandleState.userType === "MANAGER"
	// true
);// 是否允许该用户撤回方案(只有管理员能够撤回),测试时设为true
// 2023.10.16更新：由于要求不同的用户使用不同的样式主题，这里使用themeType来控制，themeType在请求用户信息时保存到vuex
const themeType = computed(() => store.state.userHandleState.themeType);
const uploadType = computed(() => store.getters["userHandleState/uploadType"]);
const dataState = computed(() => store.getters["userHandleState/dataStateText"]);
const patientName = computed(() => store.state.userHandleState.patientName);
const arrangeShowState = computed(() => store.getters["userHandleState/arrangeShowState"]);
const isInSimMode = computed(() => store.state.actorHandleState.currentMode.straightenSimulation);
const arrangeTeethType = computed(() => store.getters["userHandleState/arrangeTeethType"]);
const userType = computed(() => store.state.userHandleState.userType);
const isArchUpdated = computed(() => store.state.actorHandleState.isArchUpdated);
const toolMenuList = computed(() => {
	const tools = [
		{
			toolName: "咬合位置",
			toolIntro: "任意调整上下颌牙的相对位置，模拟双颌开闭状态",
			activate: true,
			toolLimits: [
				{
					intro: "牙齿数据是完整双颌可排牙数据",
					isFit: arrangeTeethType.value.length === 2,
				},
				{
					intro: "需要在[模拟矫正]模式下使用",
					isFit: isInSimMode.value,
				},
				{
					intro: "牙弓线调整已更新牙弓线",
					isFit: isArchUpdated.value,
				},
			],
			allLimitsFit: false,
		},
		{
			toolName: "牙弓线调整",
			toolIntro: "自由调整牙弓线，根据新的牙弓线重新排牙",
			activate: true,
			toolLimits: [
				{
					intro: "需要在[模拟矫正]模式下使用",
					isFit: isInSimMode.value,
				},
				{
					intro: "牙齿数据至少能拟合出一条牙弓线",
					isFit: arrangeTeethType.value.length > 0,
				},
			],
			allLimitsFit: false,
		},
		{
			toolName: "生成虚拟牙根",
			toolIntro: "调整虚拟牙根方向，随后生成虚拟牙根",
			activate: true,
			toolLimits: [
				{
					intro: "需要在[普通]模式下使用",
					isFit: !isInSimMode.value,
				},
			],
			allLimitsFit: false,
		},
		{
			toolName: "开发中",
			activate: false,
		},
	];
	for (let i = 0; i < tools.length; i++) {
		tools[i].allLimitsFit = tools[i].toolLimits
			? tools[i].toolLimits.reduce((s, { isFit }) => s + isFit, 0) === tools[i].toolLimits.length
			: false;
	}
	return tools;
});
//2023.4.12更新：管理员用户进入排牙后，直接进入牙弓线调整页面
//2023.4.24更新：等待1s后再进入，否则牙弓线小球位置还没有就绪
watch(toolMenuList, (newVal, oldVal)=>{
	if (newVal[1].allLimitsFit && !oldVal[1].allLimitsFit && userType.value=='MANAGER'){
		setTimeout(() => {
			store.dispatch("actorHandleState/updateCurrentShowPanel", 1);
		}, 200);
	}
})
const currentShowPanel = computed(() => store.state.actorHandleState.currentShowPanel);
function enterToolPanel(index) {
	if (toolMenuList.value[index].allLimitsFit) {
		store.dispatch("actorHandleState/updateCurrentShowPanel", index);
	}
}
function exitToolPanel() {
	store.dispatch("actorHandleState/updateCurrentShowPanel", -1);
}

/**
 * @description: 在牙弓先调整与咬合界面间快速切换。逻辑上先退出到微调界面，在进入另一个界面。
 * @return {*}
 * @author: ZhuYichen
 */
function switchToolPanel() {
	const cur = currentShowPanel.value;
	store.dispatch("actorHandleState/updateCurrentShowPanel", -1);
	setTimeout(()=>{
		store.dispatch("actorHandleState/updateCurrentShowPanel", cur==0?1:0);
	},0)
}
/**
 * @description: 校验是否已经更新了牙弓线，更新后才能进入咬合调整界面
 * @return {*}
 * @author: ZhuYichen
 */
function checkArchUpdated(){
	store.dispatch("actorHandleState/updateIsArchUpdated", true);
}
</script>

<style lang="scss" scoped>
.origin {
	@import './indexStyle.scss';
}
.new {
	@import './indexStyle2.scss';
}
</style>
