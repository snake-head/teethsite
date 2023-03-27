<template>
	<div class="main-block tools" :class="{ show: isShow }">
		<div class="icon-auxtool bg" :class="{ active: showToolMenu }" @click="switchShowToolMenu()" />
		<div class="tool-menu" :class="{ show: showToolMenu }">
			<div class="tool-menu-body clear-fix">
				<ul class="tool-list">
					<li
						v-for="({ toolName, activate }, index) in toolMenuList"
						:key="`tool-${index}`"
						:class="{ deactivate: !activate, selected: currentSelectToolIndex === index }"
						@click="switchCurrentSelectToolIndex(index)"
					>
						{{ toolName }}
					</li>
				</ul>
				<div class="tool-intro">
					<div class="btn-area">
						<button
							class="use-btn"
							:class="{ activate: toolMenuList[currentSelectToolIndex].allLimitsFit }"
							@click="enterToolPanel(currentSelectToolIndex)"
						>
							使用
						</button>
					</div>
					<div class="intro-area">
						<div class="title">工具说明</div>
						<div class="detail">
							{{ toolMenuList[currentSelectToolIndex].toolIntro }}
						</div>
					</div>
					<div class="intro-area">
						<div class="title">使用限制</div>
						<ul>
							<li
								class="detail"
								v-for="({ intro, isFit }, limitIdx) in toolMenuList[currentSelectToolIndex].toolLimits"
								:class="{ fit: isFit }"
								:key="`tool-limit-${limitIdx}`"
							>
								{{ intro }}
							</li>
						</ul>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
import { ref, defineProps } from "vue";
const props = defineProps({
	isShow: {
		type: Boolean,
		default: false,
	},
	toolMenuList: {
		type: Object,
		default: () => ({}),
	},
	enterToolPanel: {
		type: Function,
		default: () => {},
	},
});
let showToolMenu = ref(false);
function switchShowToolMenu() {
	showToolMenu.value = !showToolMenu.value;
}
let currentSelectToolIndex = ref(0);
function switchCurrentSelectToolIndex(index) {
	if (props.toolMenuList[index].activate) {
		currentSelectToolIndex.value = index;
	}
}
</script>

<style lang="scss" scoped>
$trans-time: 0.2s;
$view-head-height: 66px;
.icon-auxtool {
	background-image: url("../../assets/Icon_auxtool.png");
}
.bg {
	position: relative;
	width: 40px;
	height: 40px;
	backface-visibility: hidden;
	background-size: 100% 100%;
	background-repeat: no-repeat;
}
.main-block {
	&.tools {
		box-sizing: border-box;
		height: 0;
		overflow: hidden;
		visibility: hidden;
		transition: 0.2s;
		opacity: 0;
		transform: translateY(-10px) scaleY(0.1);
		&.show {
			visibility: visible;
			opacity: 1;
			transform: none;
			height: 100%;
		}
	}

	&.tools {
		.icon-auxtool {
			margin-top: 13px;
			margin-left: 10px;
			border: transparent 2px solid;
			cursor: pointer;
			&:hover {
				border: rgb(236, 168, 25) 2px solid;
			}
			&.active {
				border: rgb(236, 168, 25) 2px outset;
				border-radius: 5px;
			}
		}
		.tool-menu {
			position: absolute;
			top: $view-head-height;
			left: 0;
			width: 100%;
			border: 1px solid rgba(236, 168, 25, 0.8);
			border-top: none;
			border-bottom-left-radius: 5px;
			border-bottom-right-radius: 5px;
			// background-color: #545c64;
			background: linear-gradient(to bottom, #24292e, #545c64f0);
			box-sizing: border-box;
			z-index: 101;
			padding: 5px;
			visibility: hidden;
			height: 0px;
			overflow: hidden;
			transition: 0.2s;
			&.show {
				visibility: visible;
				height: 310px;
			}
			.tool-menu-body {
				border-top: 1px solid rgba(236, 168, 25, 0.8);
				box-sizing: border-box;
				width: 100%;
				.tool-list {
					width: 30%;
					max-height: 300px;
					overflow-y: auto;
					float: left;
					display: inline-block;
					li {
						font-size: 20px;
						height: 36px;
						line-height: 36px;
						border-bottom: 1px solid rgba(236, 168, 25, 0.8);
						cursor: pointer;
						&:hover {
							background-color: #434a50;
						}
						&.deactivate {
							color: rgb(179, 179, 179);
							opacity: 0.8;
							&:hover {
								cursor: default;
								background-color: #505760;
							}
						}
						&.selected {
							background: #34383b;
							font-size: 22px;
						}
					}
				}
				.tool-intro {
					overflow: hidden;
					width: 70%;
					height: 300px;
					float: left;
					display: inline-block;
					// background-color: red;
					box-sizing: border-box;
					border-left: 1px solid rgba(236, 168, 25, 0.8);
					padding: 5px;
					.btn-area {
						float: right;
						width: 110px;
						padding: 5px;
						height: 50px;
						line-height: 50px;
						button {
							width: 100px;
							height: 50px;
							line-height: 50px;
							font-size: 26px;
							color: #5b6166;
							background-color: #e6e6e6;
							border: 2px outset #858585;
							border-radius: 5px;
							opacity: 0.6;
							&.activate {
								cursor: pointer;
								opacity: 1;
								&:hover {
									background-color: #f0f0f0;
									color: #000;
								}
							}
						}
					}
					.intro-area {
						text-align: start;
						white-space: normal;
						margin-bottom: 20px;
						.title {
							width: 150px;
							padding-left: 16px;
							font-size: 20px;
							border-bottom: 1px solid rgba(236, 168, 25, 0.8);
						}
						li {
							height: 26px;
						}
						.detail {
							padding-left: 12px;
							font-size: 16px;
							text-indent: 32px;
							line-height: 26px;
							&.fit {
								color: rgb(50, 205, 50);
								&::before {
									content: "\2714";
									opacity: 1;
								}
							}
						}
					}
				}
			}
		}
	}
}
</style>
