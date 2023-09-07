<template>
	<div class="view-head">
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
</template>

<script setup>
import { computed, watch, ref } from "vue";
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
		// {
		// 	toolName: "生成虚拟牙根",
		// 	toolIntro: "调整虚拟牙根方向，随后生成虚拟牙根",
		// 	activate: true,
		// 	toolLimits: [
		// 		{
		// 			intro: "需要在[普通]模式下使用",
		// 			isFit: !isInSimMode.value,
		// 		},
		// 	],
		// 	allLimitsFit: false,
		// },
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
$trans-time: 0.2s;
$view-head-height: 66px;

.clear-fix {
	&::after,
	&::before {
		content: "";
		clear: both;
		display: table;
	}
}
.view-head {
	font-size: 14px;
	height: $view-head-height;
	background-color: #24292e;
	color: rgba(255, 255, 255, 0.7);
	line-height: 1.5;
	padding: 0 10px;
	z-index: 1000;

	.icon-icon {
		background-image: url("../../assets/Icon_newcase.png");
	}

	.head-line {
		height: 100%;
		user-select: none;
	}
	.bg {
		position: relative;
		width: 40px;
		height: 40px;
		backface-visibility: hidden;
		background-size: 100% 100%;
		background-repeat: no-repeat;
	}
	.title-block {
		height: $view-head-height - 20px;
		margin: 10px 0;
		text-align: center;
		// border-right: solid 1px #cccccc;
		white-space: nowrap;
		position: relative;
		overflow: hidden;
		&::after {
			content: "";
			position: absolute;
			top: 0;
			right: 0;
			display: inline-block;
			height: $view-head-height - 20px;
			border-right: 1px solid #cccccc;
		}
		&.no-margin {
			height: $view-head-height;
			margin: 0;
			&::after {
				top: 10px;
			}
		}
		&.over-vis {
			overflow: visible;
		}

		ul li {
			list-style: none;
			height: 20px;
			line-height: 20px;
			width: 100%;
			transition: $trans-time;
			&.bold {
				font-weight: bold;
			}
		}
		.normal-info li {
			letter-spacing: 0;
			opacity: 1;
		}
		.data-state-info {
			&.done {
				color: #a7aeb4;
			}
			&.doing {
				color: #43e050;
			}
		}
	}
	.op-block {
		line-height: $view-head-height - 20px;
		cursor: pointer;
		width: 100%;
		height: 100%;
		display: block;
		&:hover {
			color: khaki;
		}
	}
	.main-block.progress {
		overflow: hidden;
		height: 0px;
		display: flex;
		justify-content: center;
		flex-wrap: wrap;
		// margin: 8px 0;
		transition: 0.2s;
		visibility: hidden;
		opacity: 0;
		transform: translateY(10px) scaleY(0.1);
		&.show {
			height: 30px;
			margin: 15px 0;
			visibility: visible;
			opacity: 1;
			transform: none;
		}
		.arrange-progress-bar {
			height: 50%;
			width: 80%;
		}
	}
}
</style>
