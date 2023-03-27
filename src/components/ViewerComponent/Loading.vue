<template>
	<div
		class="loading"
		:class="{
			warning: upperState.type === 'error' && lowerState.type === 'error',
			hide: isFinish,
		}"
	>
		<div class="element-body">
			<div class="element a" />
			<div class="element b" />
			<div class="element c" />
			<div class="element d" />
			<div class="element e" />
			<div class="element f" />
			<div class="element g" />
			<div class="element h" />
			<div class="element i" />
			<div class="element j" />
			<div class="element k" />
			<div class="element l" />
			<div
				class="element-bar"
				:class="{
					error: upperState.type === 'error' && lowerState.type === 'error',
				}"
			>
				{{ loadingProgress }}
			</div>
		</div>
		<div
			class="msg"
			:class="{
				deactive: upperState.type === 'deactive',
				error: upperState.type === 'error',
				success: upperState.type === 'success',
			}"
		>
			{{ upperState.message + upperState.progress }}
		</div>
		<div
			class="msg"
			:class="{
				deactive: lowerState.type === 'deactive',
				error: lowerState.type === 'error',
				success: lowerState.type === 'success',
				hide: upperState.message + upperState.progress === lowerState.message + lowerState.progress,
			}"
		>
			{{ lowerState.message + lowerState.progress }}
		</div>
	</div>
</template>

<script setup>
import { computed, defineProps } from "vue";
const props = defineProps({
	upperState: {
		type: Object,
		default: () => {
			return {
				message: "-",
				type: "wait",
				progress: "-",
			};
		},
	},
	lowerState: {
		type: Object,
		default: () => {
			return {
				message: "-",
				type: "wait",
				progress: "-",
			};
		},
	},
	loadingProgress: {
		type: String,
		default: "-/-",
	},
});
let isFinish = computed(() => {
	return (
		props.upperState.type !== "wait" &&
		props.lowerState.type !== "wait" &&
		(props.upperState.type === "success" || props.lowerState.type === "success")
	);
});
</script>

<style scoped>
.loading {
	background: rgba(0, 0, 0, 0.42);
	width: 100%;
	height: 100%;
	position: fixed;
	top: 0;
	left: 0;
	z-index: 1000;
}
.loading.hide {
	display: none;
}

.element-body {
	position: relative;
	top: calc(50% - 39px);
	left: calc(50% - 39px);
	width: 78px;
	height: 78px;
	margin-left: 1px;
	margin-top: 1px;
}

@keyframes shcl_bounce {
	0% {
		transform: scale(1);
	}
	80% {
		transform: scale(0.3);
	}
	100% {
		transform: scale(1);
	}
}
@keyframes shcl_bounce_w {
	0% {
		transform: scale(0.3);
	}
	100% {
		transform: scale(0.3);
	}
}

.element {
	position: absolute;
	width: 15px;
	height: 15px;
	background: #d9edf7;
	border-radius: 8px;
	animation-name: shcl_bounce;
	animation-duration: 1s;
	animation-iteration-count: infinite;
	animation-direction: normal;
}
.element.a {
	left: 32px;
	top: 0px;
}
.element.b {
	left: 48px;
	top: 4px;
	animation-delay: 0.0833333s;
}
.element.c {
	left: 60px;
	top: 16px;
	animation-delay: 0.166667s;
}
.element.d {
	left: 64px;
	top: 32px;
	animation-delay: 0.25s;
}
.element.e {
	left: 60px;
	top: 48px;
	animation-delay: 0.333333s;
}
.element.f {
	left: 48px;
	top: 60px;
	animation-delay: 0.416667s;
}
.element.g {
	left: 32px;
	top: 64px;
	animation-delay: 0.5s;
}
.element.h {
	left: 16px;
	top: 60px;
	animation-delay: 0.583333s;
}
.element.i {
	left: 4px;
	top: 48px;
	animation-delay: 0.666667s;
}
.element.j {
	left: 0px;
	top: 32px;
	animation-delay: 0.75s;
}
.element.k {
	left: 4px;
	top: 16px;
	animation-delay: 0.833333s;
}
.element.l {
	left: 16px;
	top: 4px;
	animation-delay: 0.916667s;
}
.element-bar {
	position: absolute;
	width: 79px;
	height: 19px;
	left: 0;
	top: 30px;
	text-align: center;
	color: #d9edf7;
	font-weight: 600;
	font-size: 15px;
}

.element-bar.error {
	color: #993333;
}

.msg {
	position: relative;
	top: calc(50% - 34px);
	text-align: center;
	color: #d9edf7;
}
.msg.hide {
	visibility: hidden;
}
.msg.error {
	color: #993333;
}
.msg.success {
	color: #31ca31;
}
.msg.deactive {
	color: rgba(104, 102, 102, 0.7);
}

.loading.error .element-body .element-bar {
	color: #993333;
}
.loading.warning .element {
	background: #993333;
	animation-name: shcl_bounce_w;
}
</style>
