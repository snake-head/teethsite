<template>
	<div class="dialog" :class="{ hide: !dialogState.show, forbid: dialogState.submit }" @click.stop="">
		<div class="dialog-title">{{ dialogSetting.title }}</div>
		<div class="del-msg" :class="{ hide: dialogState.submit }">
			<div>{{ dialogSetting.content }}</div>
		</div>
		<div class="del-msg" :class="{ hide: !dialogState.submit }">
			<template v-for="teethType in ['upper', 'lower']" :key="teethType">
				<div class="bar-msg" :class="{ active: uploadType.includes(teethType) }">
					{{ teethType === "upper" ? "上" : "下" }}颌牙
				</div>
				<div class="progress-line">
					<el-progress :percentage="progress[teethType]">
						<span class="upload-text" :class="{ active: uploadType.includes(teethType) }">
							{{ uploadType.includes(teethType) ? progress[teethType] : "-" }}%
						</span>
					</el-progress>
				</div>
			</template>
		</div>
		<div class="del-msg tip-msg" :class="{ hide: !(dialogState.submit && dialogSetting.waitingTips !== '') }">
			<div>{{ dialogSetting.waitingTips }}</div>
		</div>
		<div class="final-msg" :class="{ hide: dialogSetting.confirm === '' }">
			{{ dialogSetting.confirm }}
		</div>
		<div class="secondary-checkbox" :class="{ hide: !dialogSetting.secondaryConfirm }">
			<span class="check-line" :class="{ checked: dialogState.secondaryChecked }" @click="changeBoxChecked()">
				请勾选以确认继续提交
			</span>
		</div>
		<div class="btn-body">
			<button class="btn" :class="{ disabled: !btnEnabled }" @click.stop="confirmCallBack()">
				确认
			</button>
			<button class="btn" @click.stop="changeShowState(false)">
				取消
			</button>
		</div>
	</div>
</template>

<script setup>
import { computed, defineProps } from "vue";
import { useStore } from "vuex";
const props = defineProps({
	dialogSetting: {
		type: Object,
		default: () => ({
			title: "提示",
			content: "-",
			confirm: "是否确认执行该操作？",
			secondaryConfirm: false,
		}),
	},
	dialogState: {
		type: Object,
		default: () => ({
			show: false, // 显示/隐藏
			submit: false, // 在提交操作中不可更改state的状态, 即changeDialogShowState失效
			secondaryChecked: false, // 需要二次确认时使用
		}),
	},
	changeShowState: {
		type: Function,
		default: () => {},
	},
	changeBoxChecked: {
		type: Function,
		default: () => {},
	},
	confirmCallBack: {
		type: Function,
		default: () => {},
	},
});

const store = useStore();
const uploadType = computed(() => store.getters["userHandleState/uploadType"]);
const progress = computed(() => {
	return {
		upper: store.state.userHandleState.uploadState.upper.progress,
		lower: store.state.userHandleState.uploadState.lower.progress,
	};
});
let btnEnabled = computed(() => !props.dialogSetting.secondaryConfirm || props.dialogState.secondaryChecked);
</script>

<style lang="scss" scoped>
$dialog-width: 500px;
$dialog-padding: 20px;
$dialog-height-confirm: 230px;
$title-height: 30px;
$content-height: 20px;
$app-name-height: 35px;
$progress-line-height: 20px;
$trans-time: 0.1s;
.dialog {
	position: absolute;
	top: 15%;
	left: calc(50% - $dialog-width/2 - $dialog-padding - 2px);
	padding: $dialog-padding;
	border: outset 2px rgba(15, 15, 15, 0.9);
	border-radius: 5px;
	background-color: #ececec;
	opacity: 1;
	transition: $trans-time;
	user-select: None;
	width: $dialog-width;
	height: auto;
	&.hide {
		visibility: hidden;
		opacity: 0;
		transform: translateY(-30px);
	}
	&.forbid {
		pointer-events: none;
		opacity: 0.95;
	}
	&:hover {
		background-color: #e0e0e0;
	}
	.dialog-title {
		padding-left: 15px;
		width: $dialog-width;
		height: $title-height;
		line-height: $title-height;
		color: #5d5d5d;
		font-size: 22px;
		font-weight: 600;
		letter-spacing: 4px;
		margin-bottom: 10px;
		border-bottom: #6a6a6a 2px solid;
	}
	.del-msg {
		position: relative;
		padding-left: 30px;
		width: $dialog-width - 60px;
		height: auto;
		line-height: $content-height;
		border-bottom: #bababa 2px solid;
		color: #717171;
		text-indent: 20px;
		font-size: 15px;
		font-weight: 600;
		letter-spacing: 1px;
		word-wrap: break-word;
		transition: $trans-time;
		padding-bottom: 10px;
		&.hide {
			height: 0;
			padding: 0;
			margin: 0;
			border: 0;
			visibility: hidden;
			opacity: 0;
			transform: translateY(-5px);
		}
		.bar-msg {
			padding-left: 15px;
			height: $title-height;
			line-height: $title-height;
			font-size: 17px;
			font-weight: 600;
			letter-spacing: 2px;
			color: #b4b4b4;
			&.active {
				color: #717171;
			}
		}
	}
	.tip-msg {
		border: #bababa 1px solid;
		font-size: 15px;
		font-weight: 600;
		letter-spacing: 0;
		padding: 5px 10px;
		background: linear-gradient(to right, rgba(186, 186, 186, 0.8) 50%, rgba(186, 186, 186, 0) 50%);
		background-size: 200% 100%;
		background-position: 100% 0;
		&:hover {
			color: #717171;
			background-position: 0 0;
		}
	}
	.final-msg {
		color: #717171;
		padding-left: 30px;
		width: $dialog-width - 60px;
		font-size: 20px;
		font-weight: 600;
		font-style: oblique;
		padding-top: 10px;
		&.hide {
			height: 0;
			padding: 0;
			margin: 0;
			border: 0;
			visibility: hidden;
			opacity: 0;
		}
	}
	.secondary-checkbox {
		text-align: center;
		height: 30px;
		line-height: 30px;
		padding: 5px 0;
		&.hide {
			height: 0;
			padding: 0;
			margin: 0;
			border: 0;
			visibility: hidden;
			opacity: 0;
		}
		.check-line {
			font-size: 17px;
			font-weight: 600;
			color: #646464;
			cursor: pointer;
			transition: $trans-time;
			border: #cccccc 2px solid;
			border-radius: 5px;
			padding: 2px 50px;
			&::after {
				display: inline-block;
				transition: $trans-time;
				width: 20px;
				height: 20px;
				border-radius: 10px;
				line-height: 20px;
			}
			&:hover {
				background-color: #eeeeee;
			}
			&.checked {
				color: #303030;
				background-color: #f4f4f4;
				border: rgb(137, 211, 245) 2px solid;
				&::after {
					content: "\2714";
					background: rgb(94, 199, 226);
					color: white;
					opacity: 1;
				}
			}
		}
	}

	.btn-body {
		margin-top: 15px;
		display: flex;
		align-content: center;
		justify-content: space-around;
		.btn {
			width: 120px;
			height: 45px;
			font-size: 20px;
			font-weight: 600;
			letter-spacing: 10px;
			text-indent: 10px;
			color: #717171;
			background-color: #ececec;
			border-radius: 8px;
			border: 1px solid #0f0f0f;
			transition: $trans-time;
			cursor: pointer;
			&.long {
				width: 140px;
			}
			&:hover {
				background-color: #f1f1f1;
				color: #0f0f0f;
			}
			&.disabled {
				pointer-events: none;
				opacity: 0.8;
				border: 1px solid #636363;
				color: #aaaaaa;
			}
		}
	}
	.msg-body {
		margin-top: 10px;
		margin-left: 10px;
		color: #4c4c4c;
		&.success {
			color: #4cb04c;
		}
		&.failed {
			color: #b04c4c;
		}
	}
	.progress-line {
		white-space: nowrap;
		padding: 0 40px;
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
			transform: translate(0, -$progress-line-height);
		}
		.upload-text {
			color: #b4b4b4;
			&.active {
				font-size: 13px;
				color: #777777;
			}
		}
	}
}
</style>
