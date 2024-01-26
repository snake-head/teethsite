<template>
	<div :class="themeType">
		<div class="right-side-menu" :class="showRightSidemenu ? 'show' : 'hide'">
			<el-tabs class="demo-tabs" v-model="activeTable" type="card">
				<el-tab-pane class="demo-tab-pane" label="垂直向高度(mm)" name="distance">
					<div class="distance-table">
						<div class="dt-col" v-for="(itemList, index) in distanceMessageList" :key="index">
							<div
								class="dt-row"
								:class="{ selected: currentSelectBracket.name === item.name }"
								v-for="item in itemList"
								:key="item.rowId + '-' + item.colId"
							>
								<div class="dt-name-box" @click="updateSelectedBracketActorByListClick(item.name)">
									<span>{{ item.name }}</span>
								</div>
								<div class="dt-dist-box">
									<span>{{ item.distance ? item.distance.toFixed(1) : "-" }}</span>
								</div>
							</div>
						</div>
					</div>
				</el-tab-pane>
				<el-tab-pane class="demo-tab-pane" label="转矩" name="rotate" v-if="hasRotateInfo">
					<div class="distance-table">
						<div class="dt-col" v-for="(itemList, index) in rotateMessageList" :key="index">
							<div
								class="dt-row"
								:class="{ selected: currentSelectBracket.name === item.name }"
								v-for="item in itemList"
								:key="item.rowId + '-' + item.colId"
							>
								<div class="dt-name-box" @click="updateSelectedBracketActorByListClick(item.name)">
									<span>{{ item.name }}</span>
								</div>
								<div class="dt-dist-box">
									<span>{{ item.rotate ? item.rotate+item.plus : "-" }}</span>
									<div class="dt-msg-box">
										<span>{{ item.rotate ? 
										item.rotate.toString()+(item.plus>=0?'+':'')+item.plus.toString()
										: "-" }}</span>
									</div>
								</div>
								
							</div>
						</div>
					</div>
				</el-tab-pane>
			</el-tabs>
			
			<div class="tooth-drag-window">
				<div ref="vtkSegToothContainer" class="tooth-container" />
			</div>
			<div class="tooth-drag-window">
				<div ref="vtkPictureContainer" class="tooth-container">
					<canvas ref="vtkPictureTextContainer" class="pic-text-container" />
				</div>
			</div>
		</div>

		<div ref="vtkContainer" class="container">
			<canvas ref="vtkTextContainer" class="text-container" />
		</div>
	</div>
	
</template>

<script setup>
import {
	ref,
	computed,
	watch,
	watchEffect,
	onMounted,
	onBeforeUnmount,
	getCurrentInstance,
	toRaw,
	defineProps,
	inject,
	provide
} from "vue";
import { useStore } from "vuex";
import { cloneDeep } from 'lodash'
import vtkGenericRenderWindow from "@kitware/vtk.js/Rendering/Misc/GenericRenderWindow";

// hardware selector test
import { throttle } from "@kitware/vtk.js/macro";
import { FieldAssociations } from "@kitware/vtk.js/Common/DataModel/DataSet/Constants";

import vtkOrientationMarkerWidget from "@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget";
import vtkAxesActor from "@kitware/vtk.js/Rendering/Core/AxesActor";
import vtkInteractorStyleImage from "../../reDesignVtk/reDesignInteractorStyleImage";
import vtkInteractorStyleTrackballCameraNew from "../../reDesignVtk/reDesignInteractorStyleTrackballCamera";

import vtkSphereLinkHandleRepresentation from "../../reDesignVtk/dentalArchHandleWidget/SphereLinkHandleRepresentation";
import dentalArchHandleWidget from "../../reDesignVtk/dentalArchHandleWidget";

import actorControl, { colorConfig } from "../../hooks/actorControl";
import rootFunc from "../../hooks/rootFunc";
import asyncDataLoadAndParse from "../../hooks/asyncDataLoadAndParse";
import { uploadCurrentData } from "../../utils/saveNewData";
import asyncTeethArrange from "../../hooks/asyncTeethArrange";
import { calculateRigidBodyTransMatrix, updateBracketDataByLandMark } from "../../utils/bracketFineTuneByTypedArray";
import {
	calculateRigidBodyTransMatrix as calculateRigidBodyTransMatrixSpec,
	generateTeethAxisByNormal,
	calculateArchY,
} from "../../hooks/arrangeFunc";
import userMatrixControl, {
	multiplyMatrix4x4,
	multiplyMatrixList4x4,
	invertMatrix4x4,
} from "../../hooks/userMatrixControl";
import vtkMatrixBuilder from "@kitware/vtk.js/Common/Core/MatrixBuilder";
import { browserType } from "../../utils/browserTypeDetection";
import { add, multiplyScalar, subtract, dot } from "@kitware/vtk.js/Common/Core/Math";
import { sendRequestWithToken } from "../../utils/tokenRequest";
import TeethBiteWorker from "../../hooks/teethBite.worker";
import { norm } from "../../reDesignVtk/Math";
import { presetArrangeDataList } from "../../static_config";
import { ElMessage } from 'element-plus'
import Slicing from "../../hooks/Slicing"
import { FineTunePiece } from "../../hooks/Slicing"
import vtkPolyData from "@kitware/vtk.js/Common/DataModel/PolyData";
import vtkCellArray from "@kitware/vtk.js/Common/Core/CellArray";
import vtkPoints from "@kitware/vtk.js/Common/Core/Points";
import vtkActor from "@kitware/vtk.js/Rendering/Core/Actor";
import vtkMapper from "@kitware/vtk.js/Rendering/Core/Mapper";


const props = defineProps({
	changeLoadingMessage: {
		type: Function,
		default: () => {},
	},
	actorInScene: {
		// 由viewerMain中的显示按钮进行调节,用于各种actor是否应该在屏幕中
		type: Object,
		default: () => ({
			upper: false, // 全上颌牙显示/隐藏
			upperOrigin: false, // 上颌牙原始牙列显示/隐藏
			upperOriginBracket: false, // 上颌牙原始托槽显示/隐藏
			upperOriginGingiva: false,
			lower: false, // 全下颌牙显示/隐藏
			lowerOrigin: false, // 下颌牙原始牙列显示/隐藏
			lowerOriginBracket: false, // 下颌牙原始托槽显示/隐藏
			lowerOriginGingiva: false,
			teethWithGingiva: 2, // 牙齿+牙龈0/牙齿1/牙龈2
			axis: false, // 坐标轴显示/隐藏
			arch: 2, // 牙弓线显示01/隐藏23, 托槽显示02/隐藏13
		}),
	},
});

const store = useStore();
const loadedBracketNameList = store.state.userHandleState.bracketNameList;
const arrangeTeethType = computed(() => store.getters["userHandleState/arrangeTeethType"]);
const uploadType = computed(() => store.getters["userHandleState/uploadType"]);
const simMode = computed(() => store.state.actorHandleState.simMode);
const isInFineTuneMode = computed(() => store.state.actorHandleState.currentMode.fineTune);
const currentMode = computed(() => store.state.actorHandleState.currentMode);
const userType = computed(() => store.state.userHandleState.userType);
// 2023.10.16更新：由于要求不同的用户使用不同的样式主题，这里使用themeType来控制，themeType在请求用户信息时保存到vuex
const themeType = computed(() => store.state.userHandleState.themeType);
const activeTable = ref('distance')

const toothOpacity = computed(() => store.state.actorHandleState.toothOpacity);
const archScale = computed(() => store.state.actorHandleState.archScale);
const selectedPreset = computed(() => store.state.actorHandleState.selectedPreset);
watch(selectedPreset, ()=>{
	usePresetDentalArchCoefficients(selectedPreset.value);
	setTimeout(()=>{
		vtkContext.renderWindow.render()
	},10)
})
const clickUsePreset = computed(() => store.state.actorHandleState.clickUsePreset);
watch(clickUsePreset, ()=>{
	if(clickUsePreset.value){
		moveLinkToPreset()
		store.dispatch("actorHandleState/setClickUsePreset", false)
	}
})
function moveLinkToPreset(){
	const curPreset = presetArrangeDataList.filter((item)=>{
		return item.number == selectedPreset.value
	})[0]
	
	for (let teethType of ['upper', 'lower']){
		// 从配置文件中读取预设的牙弓线
		const {coEfficients} = curPreset[teethType].dentalArchSettings
		// 覆盖DentalArchAdjustRecord中的牙弓线系数，在重新生成调整小球时使用新的系数来生成
		store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
			[teethType]: {
				coEfficients,
			},
		});
	}
}
watch(archScale, ()=>{
	reScaleDentalArchCoefficients(archScale.value);
	setTimeout(()=>{
		vtkContext.renderWindow.render()
	},10)
})
watch(toothOpacity,(newValue)=>{
	for(let teethType of ['upper','lower']){
		allActorList[teethType].originTooth.forEach((item) => {
			item.actor.getProperty().setOpacity(newValue/100)
		});
		allActorList[teethType].originRoot.forEach((item) => {
			item.actor.getProperty().setOpacity(newValue/100)
		});
		if(allActorList[teethType].originGingiva.actor){
			allActorList[teethType].originGingiva.actor.getProperty().setOpacity(newValue/100)    
		}
	}
	vtkContext.renderWindow.render();
})
watch(arrangeTeethType, (newVal)=>{
	// 如果只有单颌数据被成功加载, 那么后续调整牙弓线的选择最多也就一项
	if (newVal.length === 1) {
			store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
				teethType: newVal[0],
			});
		}
})
// 进入/退出细调 -> 开启托槽选择鼠标事件
watch(
	() => currentMode.value.fineTune,
	(newValue) => {
		if (newValue) {
			openBracketSelection();
		} else {
			closeBracketSelection();
		}
	}
);
// 进入/退出模拟排牙
watch(
	() => currentMode.value.straightenSimulation,
	(newValue) => {
		if (newValue) {
			openSimulationMode();
		} else {
			exitSimulationMode();
		}
	}
);
const fineTuneMode = computed(() => store.getters["actorHandleState/fineTuneMode"]);
const teethPositionAdjustType = computed(() => store.state.actorHandleState.teethPositionAdjust.teethType);
watch(teethPositionAdjustType, (newVal, oldVal) => {
	adjustTeethAxisSphereActorInScene("switch", newVal, oldVal);
});
const currentShowPanel = computed(() => store.state.actorHandleState.currentShowPanel);
watch(currentShowPanel, (newVal, oldVal) => {
	// 从[工具菜单]进入[咬合位置]
	if (oldVal === -1 && newVal === 0) {
		adjustTeethAxisSphereActorInScene("enter", teethPositionAdjustType.value, null);
		fineTuneTeethPosition({
			moveType: "OPEN_PANEL",
		});
	}
	// 从[咬合位置]退出到[工具菜单]
	if (oldVal === 0 && newVal === -1) {
		adjustTeethAxisSphereActorInScene("exit", teethPositionAdjustType.value, null);
		fineTuneTeethPosition({
			moveType: "EXIT_PANEL",
		});
	}
	// 从[工具菜单]进入[牙弓线调整]
	if (oldVal === -1 && newVal === 1) {
		// 切换面板时，应该从dentalArchSettings中读取系数
		regenerateDentalArchWidget([], true);
		adjustDentalArchWidgetInScene("enter");
		// 关闭托槽微调
		store.dispatch("actorHandleState/updateCurrentMode", {
			fineTune: false,
		});
	}
	// 从[牙弓线调整]退出到[工具菜单]
	if (oldVal === 1 && newVal === -1) {
		adjustDentalArchWidgetInScene("exit");
		// 删除actor, 重置牙弓线
		// store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
		// 	upper: { reset: true },
		// 	lower: { reset: true },
		// });
		// 开启微调托槽
		store.dispatch("actorHandleState/updateCurrentMode", {
			fineTune: true,
		});
	}
	// 从[工具菜单]进入[虚拟牙根]
	if (oldVal === -1 && newVal === 2) {
		generateRootDirection();
		adjustRootWidgetInScene("enter",vtkContext);
		setGingivaOpacity(0.5);
	}
	// 从[虚拟牙根]退出到[工具菜单]
	if (oldVal === 2 && newVal === -1) {
		adjustRootWidgetInScene("exit",vtkContext);
		setGingivaOpacity(1);
	}
	// 从[虚拟牙根]进入到[牙弓线调整]
	if (oldVal === 2 && newVal === 1) {
		adjustRootWidgetInScene("exit",vtkContext);
		setGingivaOpacity(1);
		// 切换面板时，应该从dentalArchSettings中读取系数
		regenerateDentalArchWidget([], true);
		adjustDentalArchWidgetInScene("enter");
		// 关闭托槽微调
		store.dispatch("actorHandleState/updateCurrentMode", {
			fineTune: false,
		});
	}
	// 从[工具菜单]进入[牙齿切片]
	if (oldVal === -1 && newVal === 3) {
		// console.log('管理员模式', store.state.userHandleState.userType)
	}
	// 从[牙齿切片]退出到[工具菜单]
	if (oldVal === 3 && newVal === -1) {
		resetgenerateBoxToolTune(vtkContext, Tuneactor);
		resetgenerateBoxTool(vtkContext, actors);
		vtkContext.renderWindow.render();
		resetSurroundingBoxsPoints();
	}
});
let dentalArchWidgets = {}; // 每次调整后再排牙后需要重新设置
let initFittingCenters = {};
/**
 * @description 进入牙弓线调整面板时调用, 生成调整小球
 * 小球的位置有两种确定方式, 如果有resetCenters就直接用里面的数据
 * 如果没有就从托槽位置计算得到
 * resetCenters会在每次[保存]的时候存入, 存的就是这些调整小球当时的位置
 * 这个函数有两个调用时机: 一是进入面板时, 二是保存时, 保存时会重新生成小球
 * 但保存时存入的resetCenters其实还没有存入, 或者说读不到, 所以此时就临时用centers参数传入函数里
 * resetCenters有参数就用参数, 参数未定义就去store里取
 * 2023.7.26更新：不再使用记录的小球位置，每次都重新计算小球位置，使其位于牙弓线上。
 * 				因此，排牙时的拟合点必须为上次排牙的结果，也就是作用mat2后的位置
 */
function regenerateDentalArchWidget(specTeethType = [], firstGenerate = false) {
	// dentalArchWidgets = {};
	// initFittingCenters = {};
	let reGenerateTeethType = specTeethType.length > 0 ? specTeethType : arrangeTeethType.value;
	for (let teethType of reGenerateTeethType) {
		dentalArchWidgets[teethType] = [];
		initFittingCenters[teethType] = { centers: {} };
		let lrBracketNames = {
			left: toRaw(loadedBracketNameList[teethType]).filter((n) => n[1] === "L"),
			right: toRaw(loadedBracketNameList[teethType]).filter((n) => n[1] === "R"),
		};
		lrBracketNames.left.sort((a, b) => Number.parseInt(a[2]) - Number.parseInt(b[2]));
		lrBracketNames.right.sort((a, b) => Number.parseInt(a[2]) - Number.parseInt(b[2]));
		let lessBracketSide = lrBracketNames.left.length < lrBracketNames.right.length ? "left" : "right";
		let resetCenters = toRaw(dentalArchAdjustRecord[teethType].resetCenters),
			resetCentersNamesList = Object.keys(resetCenters);
		// 新增一个控制深度的widget
		// 初始化点 在标准牙齿坐标系下, 是牙弓线与y轴的交点, 即函数的常数项
		// 它需要由标准牙齿坐标系转换到normal坐标系 再加上 mat4转换(咬合)
		let aheadCenterCoordsOfStandardTeethAxis, behindCenterCoordsOfStandardTeethAxis, invMatrix;

		let { zLevelOfArch, W } = toRaw(dentalArchSettings[teethType]);
		let coEfficients;
		// 如果是切换面板/重置，需要从dentalArchSettings中读取系数，相当于保存点
		if (firstGenerate){
			coEfficients= toRaw(dentalArchSettings[teethType]).coEfficients;
		}else{
			// 其他情况下从dentalArchAdjustRecord中读取系数，也就是只更新不保存
			coEfficients = toRaw(dentalArchAdjustRecord[teethType].coEfficients)
		}
		// 前面的小球
		aheadCenterCoordsOfStandardTeethAxis = [0, coEfficients[0][0], zLevelOfArch];
		// 后面的小球(x和z相同, y取不同)
		behindCenterCoordsOfStandardTeethAxis = [0, calculateArchY(W / 2, coEfficients), zLevelOfArch];
		const { center, xNormal, yNormal, zNormal } = toRaw(teethStandardAxis)[teethType];
		let transMatrix = calculateRigidBodyTransMatrixSpec(
			[1, 0, 0, 0, 1, 0, 0, 0, teethType === "upper" ? -1 : 1, 0, 0, 0],
			generateTeethAxisByNormal(center, xNormal, yNormal, zNormal)
		);

		// 转换
		vtkMatrixBuilder
			.buildFromDegree()
			.setMatrix(transMatrix)
			.apply(aheadCenterCoordsOfStandardTeethAxis)
			.apply(behindCenterCoordsOfStandardTeethAxis);
		initFittingCenters[teethType].centers["D0"] = [...aheadCenterCoordsOfStandardTeethAxis];
		initFittingCenters[teethType].centers["D1"] = [...behindCenterCoordsOfStandardTeethAxis];
		vtkMatrixBuilder
			.buildFromDegree()
			.setMatrix(userMatrixList.mat4[teethType])
			.apply(aheadCenterCoordsOfStandardTeethAxis)
			.apply(behindCenterCoordsOfStandardTeethAxis);
		invMatrix = userMatrixList.invMat4[teethType];
		

		// 构造widget
		const sphereLinkRep = vtkSphereLinkHandleRepresentation.newInstance({
			sphereLinkInitValue: {
				leftSphereCenter: aheadCenterCoordsOfStandardTeethAxis,
				rightSphereCenter: behindCenterCoordsOfStandardTeethAxis,
			},
		});
		const afterModifyLinkLength = (pos) => {
			let leftCenter = [...pos[0]],
				rightCenter = [...pos[1]];
			// 存入center前先反变换回去
			vtkMatrixBuilder
				.buildFromDegree()
				.setMatrix(invMatrix)
				.apply(leftCenter)
				.apply(rightCenter);
			// 提交这个修改到actorHandleState中, 然后触发监听事件, 触发重新生成牙弓线
			store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
				reCalculateArch: true,
				[teethType]: {
					centers: { D0: leftCenter, D1: rightCenter },
				},
			});
		};
		const sphereLinkWidget = dentalArchHandleWidget.newInstance({
			allowHandleResize: 0,
			widgetRep: sphereLinkRep,
			afterModifyLinkLength,
		});
		sphereLinkWidget.setInteractor(vtkContext.interactor);
		dentalArchWidgets[teethType].push({
			name: { left: "D0", right: "D1" },
			invMatrix: {
				left: invMatrix,
				right: invMatrix,
			},
			sphereLinkRep,
			sphereLinkWidget,
			resetCenter: {
				left: [...aheadCenterCoordsOfStandardTeethAxis],
				right: [...behindCenterCoordsOfStandardTeethAxis],
			}, // 初始位置(重置用)
		});
		for (let i = lrBracketNames[lessBracketSide].length - 1; i >= 1; i -= 2) {
			// fineTuneRecord.actorMatrix.center: 托槽在牙齿上的最新位置
			// 即托槽读入后(在原点位)经过mat1和mat3转换后的位置
			// 注意每次排牙后, mat1更新为mat1*mat3, mat3更新为identity
			// 通过这种更新维持 mat1 为 托槽: [原点]->[排牙前一刻的位置]
			// mat3 为 托槽: [排牙前一刻位置]->[经微调后的位置]

			// 两个中心点即为mat1和mat3之后的[经微调后的位置]
			// 首先通过invMat3, 此时的位置为[排牙前一刻位置]
			// 再通过mat2, 此时的位置为[牙弓线上拟合位置]
			// 再通过mat4, 此时的位置为[咬合关系调整后]的[牙弓线上拟合位置]
			// 注意mat4实际上就是咬合关系调整的矩阵(2022.7), 之前有些注释可能没更新, 写错了
			// 两个小球的转换矩阵就是 invMat3->mat2->mat4

			// 小球会在什么时候变化? 排牙或咬合关系调整时, 需要重新设置小球
			let leftSphereCenter, rightSphereCenter, invLeftTransMatrix, invRightTransMatrix;
			// 托槽当前的中心
			leftSphereCenter = [
				...bracketData[teethType].filter(({ name }) => name === lrBracketNames.left[i])[0].fineTuneRecord
					.actorMatrix.center,
			];
			rightSphereCenter = [
				...bracketData[teethType].filter(({ name }) => name === lrBracketNames.right[i])[0].fineTuneRecord
					.actorMatrix.center,
			];
			// 就是小球调整的中心, 也是最初的拟合点
			initFittingCenters[teethType].centers[lrBracketNames.left[i]] = [...leftSphereCenter];
			initFittingCenters[teethType].centers[lrBracketNames.right[i]] = [...rightSphereCenter];
			// 经过变换(排牙、咬合)显示在当前对应坐标系下供用户调整
			let leftTransMatrix = multiplyMatrixList4x4(
					userMatrixList.invMat3[lrBracketNames.left[i]],
					userMatrixList.mat2[lrBracketNames.left[i]],
					userMatrixList.mat4[teethType]
				),
				rightTransMatrix = multiplyMatrixList4x4(
					userMatrixList.invMat3[lrBracketNames.right[i]],
					userMatrixList.mat2[lrBracketNames.right[i]],
					userMatrixList.mat4[teethType]
				);
			// 逆矩阵, 小球显示的中心经过逆矩阵变换回原位, 即实际用于计算牙弓线的拟合点
			invLeftTransMatrix = invertMatrix4x4(leftTransMatrix);
			invRightTransMatrix = invertMatrix4x4(rightTransMatrix);
			vtkMatrixBuilder
				.buildFromDegree()
				.setMatrix(leftTransMatrix)
				.apply(leftSphereCenter);
			vtkMatrixBuilder
				.buildFromDegree()
				.setMatrix(rightTransMatrix)
				.apply(rightSphereCenter);

			// 变换到托槽当前的位置上, 直接setUsermatrix过去
			// 调整时需要反变换回去
			// 2023.5.31更新：使左右小球对称分布
			var symmetricPoint = calculateSymmetric(aheadCenterCoordsOfStandardTeethAxis,behindCenterCoordsOfStandardTeethAxis,leftSphereCenter)
			const sphereLinkRep = vtkSphereLinkHandleRepresentation.newInstance({
				sphereLinkInitValue: {
					leftSphereCenter,
					// rightSphereCenter
					rightSphereCenter:symmetricPoint,
				},
			});
			const afterModifyLinkLength = (pos) => {
				// 得到当前小球显示的中心点
				let leftCenter = [...pos[0]];
				let rightCenter = [...pos[1]];
				// 反变换回去
				vtkMatrixBuilder
					.buildFromDegree()
					.setMatrix(invLeftTransMatrix)
					.apply(leftCenter);
				vtkMatrixBuilder
					.buildFromDegree()
					.setMatrix(invRightTransMatrix)
					.apply(rightCenter);
				// 此时两个小球的坐标就是用于牙弓线计算的拟合点
				// 保存到store的centers中去
				store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
					reCalculateArch: true,
					[teethType]: {
						centers: {
							[lrBracketNames.left[i]]: leftCenter,
							[lrBracketNames.right[i]]: rightCenter,
						},
					},
				});
			};
			const sphereLinkWidget = dentalArchHandleWidget.newInstance({
				allowHandleResize: 0,
				widgetRep: sphereLinkRep,
				afterModifyLinkLength,
			});
			sphereLinkWidget.setInteractor(vtkContext.interactor);
			dentalArchWidgets[teethType].push({
				name: {
					left: lrBracketNames.left[i],
					right: lrBracketNames.right[i],
				},
				invMatrix: {
					left: invLeftTransMatrix,
					right: invRightTransMatrix,
				},
				sphereLinkRep,
				sphereLinkWidget,
				resetCenter: {
					left: [...leftSphereCenter],
					right: [...symmetricPoint],
				}, // 初始位置(重置用)
			});
		}
	}
	store.dispatch("actorHandleState/updateDentalArchAdjustRecord", initFittingCenters);
	vtkContext.renderWindow.render();
}

/**
 * @description: 计算空间中点C关于AB的对称点D，其中E是C在AB上的垂足
 * @param {*} A
 * @param {*} B
 * @param {*} C
 * @return {*} D 
 * @author: ZhuYichen
 */
function calculateSymmetric(A,B,C) {
	var D = [];
	var AB = subtract(B,A,[]);
	var AC = subtract(C,A,[]);
	var cosA = dot(AB, AC) / (norm(AB) * norm(AC));
	var AE = multiplyScalar([...AB],cosA*norm(AC)/norm(AB))
	var CE = subtract(AE,AC,[])
	var CD = multiplyScalar([...CE],2)
	var D = add(C,CD,[])
	return D;
}
/**
 * @description 在mat4更新后, 如果牙弓线调整小球之前有记录位置, 就需要根据现在的新mat重新生成,
 * 小球根据记录中的逆矩阵变换回原位, 再根据新的逆矩阵变换到新的位置上
 * 逆矩阵直接根据新mat更新即可
 *
 * mat2和mat3先别管了，就跟着mat4更新一下，
 * mat2是牙弓线排牙的时候更新的，一开始一次，后面都固定牙弓线排牙了，以后有需要在更新
 * mat3是托槽微调位置, 这个都在牙齿上动的, 小问题, 别管了
 */
function updateDentalArchWidgetRecordAfterMatrixUpdate() {
	let transTool = vtkMatrixBuilder.buildFromDegree();
	let newRecord = {};
	for (let teethType of arrangeTeethType.value) {
		newRecord[teethType] = {};
		let resetCenters = toRaw(dentalArchAdjustRecord[teethType].resetCenters);
		for (let name of Object.keys(resetCenters)) {
			// 如果有记录(当前小球显示中心 + 逆变换矩阵)则需要更新
			let center = [...resetCenters[name].center],
				invMatrix = [...resetCenters[name].invMatrix];
			// 小球变换回原位
			transTool.setMatrix(invMatrix).apply(center);
			let newTransMat;

			// 新矩阵
			if (["D0", "D1"].includes(name)) {
				newTransMat = userMatrixList.mat4[teethType];
			} else {
				newTransMat = multiplyMatrixList4x4(
					userMatrixList.invMat3[name],
					userMatrixList.mat2[name],
					userMatrixList.mat4[teethType]
				);
			}

			// 小球变换到新位置上
			transTool.setMatrix(newTransMat).apply(center);
			// 新逆矩阵
			invMatrix = invertMatrix4x4(newTransMat);
			// 覆盖记录
			newRecord[teethType][name] = { center, invMatrix };
		}
	}
	store.dispatch("actorHandleState/saveAdjustWidgetCenters", newRecord);
}
// 调整小球位置的回调函数中会设置reCalculateArch为true, 触发牙弓线重新拟合
const reCalculateArch = computed(
	() => store.state.actorHandleState.teethArrange.dentalArchAdjustRecord.reCalculateArch
);
/**
 * @description 重新计算牙弓线就取决于托槽位置, (原理是拟合所有托槽位置)
 * 其中最多6个托槽位置被替换成调整小球的位置, 还会加一个控制深度的点
 * (控制深度的球棍里只看前面的小球[D0], 后面的[D1]不使用)
 */
watch(reCalculateArch, (newValue) => {
	if (newValue) {
		// 根据当前调整, 整合bracketData, 提取center, 重新计算牙弓线
		let bracketCenters = {},
			teethType = dentalArchAdjustRecord.teethType,
			loadedNames = toRaw(loadedBracketNameList[teethType]),
			adjustRecord = toRaw(dentalArchAdjustRecord[teethType].centers),
			adjustNames = Object.keys(adjustRecord);
		for (let name of loadedNames) {
			if (!adjustNames.includes(name)) {
				bracketCenters[name] = {
					bracketMatrix: {
						center: [
							...bracketData[teethType].filter(({ name: n }) => n === name)[0].fineTuneRecord.actorMatrix
								.center,
						],
					},
				};
			} else {
				// 调整时需要反变换回去
				bracketCenters[name] = {
					bracketMatrix: {
						center: [...adjustRecord[name]],
					},
				};
			}
			// 2023.7.26更新：原先排牙的初始拟合点全部是在排牙前的托槽点上进行的， 现在改为在排牙后(也就是作用mat2之后)的点上进行
			let transMatrix = userMatrixList.mat2[name]
			vtkMatrixBuilder
					.buildFromDegree()
					.setMatrix(transMatrix)
					.apply(bracketCenters[name].bracketMatrix.center);
		}
		// 添加深度调整点
		if (adjustNames.includes("D0")) {
			bracketCenters.D0 = {
				bracketMatrix: {
					center: [...adjustRecord.D0],
				},
			};
		}
		reCalculateDentalArchCoefficients(teethType, bracketCenters);
		store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
			reCalculateArch: false,
		});
	}
});

// 重新生成牙弓线, 导入时使用
const isRegenerateAdjustDentalArch = computed(
	() => store.state.actorHandleState.teethArrange.dentalArchAdjustRecord.regenerate
);
watch(isRegenerateAdjustDentalArch, (newValue) => {
	if (newValue) {
		reCalculateDentalArchCoefficients(dentalArchAdjustType.value, null, false, true);
		store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
			regenerate: false,
		});
	}
});

// 如果设置reset为true, 在vuex中自动重设整个record, 在此处的监视回调中, 会重新设置小球位置+重新生成牙弓线
// 所以如果重置, dispatch时不要同时设置reCalculateArch为true
const isResetAdjustDentalArch = computed(() => store.getters["actorHandleState/isResetAdjustDentalArch"]);
/**
 * @description 重置的位置在dentalArchWidgets中, 在regenerateDentalArchWidget()里生成
 * 要么是resetCenter里的记录(只要点了一次保存就会有记录), 没记录就是托槽位置计算来的
 */
watch(isResetAdjustDentalArch, (newValue) => {
	for (let teethType of arrangeTeethType.value) {
		if (newValue[teethType]) {
			// 根据dentalArchSettings的coEfficients重新生成牙弓线
			reCalculateDentalArchCoefficients(teethType, null, true);
			// 重置所有调整小球到原位。
			// 不再采用读取记录点的方式，而是重新计算
			adjustDentalArchWidgetInScene("exit");
			regenerateDentalArchWidget([teethType], true)
			adjustDentalArchWidgetInScene("enter");
			// dentalArchWidgets[teethType].forEach(({ sphereLinkRep, resetCenter }) => {
			// 	sphereLinkRep.setCenters([...resetCenter.left], [...resetCenter.right]);
			// });
			// 重置centers为init点
			store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
				[teethType]: {
					reset: false,
					centers: initFittingCenters[teethType].centers,
				},
			});
		}
	}
});
// 根据调整后牙弓线进行排牙
const isReArrangeTeethByAdjustedDentalArch = computed(
	() => store.getters["actorHandleState/isReArrangeTeethByAdjustedDentalArch"]
);
watch(isReArrangeTeethByAdjustedDentalArch, (newValue) => {
	for (let teethType of ["upper", "lower"]) {
		if (newValue[teethType]) {
			reArrangeOneTypeTeethByAdjustedDentalArch(teethType);
			store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
				[teethType]: { reArrange: false },
			});
		}
	}
	// 需要等待牙弓线系数重新计算完毕，再重新生成小球
	setTimeout(()=>{
		adjustDentalArchWidgetInScene("exit");
		for (let teethType of ["upper", "lower"]){
			if (newValue[teethType]) {
				regenerateDentalArchWidget([teethType])
			}
		}
		adjustDentalArchWidgetInScene("enter");
	}, 600)
});
function reArrangeOneTypeTeethByAdjustedDentalArch(teethType) {
	if (dentalArchAdjustRecord[teethType].coEfficients !== null) {
		forceUpdateAtMode = fineTuneMode.value;
		// 读取当前排牙模式, 如果是从normal进来的则继续, 如果是在模拟排牙模式下则先退出
		store.dispatch("userHandleState/switchArrangeBarOpenState", true);
		// 模拟排牙
		startTeethArrangeByAdjustedDentalArch(
			teethType,
			toRaw(dentalArchAdjustRecord[teethType].coEfficients),
			Object.fromEntries(
				bracketData[teethType].map(({ name, fineTuneRecord: { actorMatrix } }) => [name, actorMatrix])
			)
		);
	}
}
// 调整牙弓线切换选中颌牙时切换小球显示
const dentalArchAdjustType = computed(() => store.state.actorHandleState.teethArrange.dentalArchAdjustRecord.teethType);
watch(dentalArchAdjustType, () => {
	// 如果当前在牙弓线面板下, 则进行switch操作, 否则这次更改可能是在加载完成时搞的
	// 但看操作, 实质上不会报错, 所以不限制也行
	if(currentShowPanel.value==1){
		adjustDentalArchWidgetInScene("switch");
	}else if(currentShowPanel.value==2){
		adjustRootWidgetInScene("switch",vtkContext);
	}
});
/**
 * @description 切换至牙弓线调整面板, 牙弓线调整面板中切换上下颌时调用
 */
function adjustDentalArchWidgetInScene(mode) {
	let selectedTeethType = dentalArchAdjustType.value;
	switch (mode) {
		case "enter": {
			dentalArchWidgets[selectedTeethType].forEach(({ sphereLinkWidget }) => {
				sphereLinkWidget.setEnabled(1);
			});
			break;
		}
		case "exit": {
			dentalArchWidgets[selectedTeethType].forEach(({ sphereLinkWidget }) => {
				sphereLinkWidget.setEnabled(0);
			});
			break;
		}
		case "switch": {
			Object.keys(dentalArchWidgets).forEach((teethType) => {
				if (teethType === selectedTeethType) {
					dentalArchWidgets[teethType].forEach(({ sphereLinkWidget }) => sphereLinkWidget.setEnabled(1));
				} else {
					dentalArchWidgets[teethType].forEach(({ sphereLinkWidget }) => sphereLinkWidget.setEnabled(0));
				}
			});
			break;
		}
	}

	// 相机可显示距离调整, 防止截断
	vtkContext.renderer.getActiveCamera().setClippingRange(1, 1000);
	vtkContext.renderWindow.render();
}
// 保存调整结果之后, 需要更新userMatrix, 然后重新生成小球
const overwriteByDentalArchAdjustRecord = computed(
	() => store.state.actorHandleState.teethArrange.dentalArchAdjustRecord.overwriteByDentalArchAdjustRecord
);
watch(overwriteByDentalArchAdjustRecord, (newValue) => {
	if (newValue) {
		// 所有widget小球的当前中心存入
		let centers = {};
		for (let teethType of arrangeTeethType.value) {
			centers[teethType] = {};
			for (let {
				name: { left: leftName, right: rightName },
				invMatrix: { left: leftMat, right: rightMat },
				sphereLinkRep,
				resetCenter,
			} of dentalArchWidgets[teethType]) {
				// 得到小球当前的显示中心(如果经过invMatrix逆变换则能得到用于牙弓线计算的拟合点坐标)
				let center = sphereLinkRep.getCenters();
				centers[teethType][leftName] = {
					center: [...center[0]],
					invMatrix: [...leftMat],
				};
				centers[teethType][rightName] = {
					center: [...center[1]],
					invMatrix: [...rightMat],
				};
				// 重置点覆盖
				resetCenter.left = [...center[0]];
				resetCenter.right = [...center[1]];
			}
		}
		// 将小球的显示中心和invMatrix全部存入, 下次生成小球时可以直接调用,
		// 注意生成小球时的initFittingCenters为这个center经过invMatrix变换后的坐标
		store.dispatch("actorHandleState/saveAdjustWidgetCenters", centers);

		// // 更新矩阵
		// // actor加入屏幕
		// adjustActorWhenSwitchSimMode("enter");
		// // 当前模式不是normal则在更新矩阵前先把所有数据转到normal(主要针对依赖点集,转换需要依赖旧矩阵)
		// if (forceUpdateAtMode !== "normal") {
		//     applyUserMatrixWhenSwitchMode(
		//         forceUpdateAtMode,
		//         "normal",
		//         true
		//     );
		// }
		// updateMatrixAfterArrangeTeeth(
		//     arrangeTeethType.value,
		//     toRaw(loadedBracketNameList),
		//     toRaw(arrangeMatrixList.value),
		//     preFineTuneRecord
		// );
		// initMatrixWhenTeethAxisSphereGenerated();
		// applyUserMatrixWhenSwitchMode("normal", simMode.value, true);
		// // 根据咬合位置进行调整
		// for (let teethType of arrangeTeethType.value) {
		//     fineTuneTeethPosition({
		//         moveType: "RESET",
		//         teethType,
		//     });
		// }

		// // 子窗口刷新
		// const { renderWindow } = vtkSegToothContext;
		// renderWindow.render();

		// 重新生成init
		store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
			overwriteByDentalArchAdjustRecord: false,
		});
	}
});

const reArrangeToInitState = computed(() => store.getters["actorHandleState/isResetDentalArchToInitState"]);
watch(reArrangeToInitState, (newValue, oldValue) => {
	for (let teethType of ["upper", "lower"]) {
		if (newValue[teethType] && !oldValue[teethType]) {
			// false -> true
			forceUpdateArrange(true, [teethType]);
			// 我们在currentArrangeStep的监听事件中使用这个方法, 然后重新生成一下小球
			// store.dispatch(
			//     "actorHandleState/updateDentalArchAdjustRecord",
			//     {
			//         [teethType]: { reArrangeToInitState: false },
			//     }
			// );
		} else if (!newValue[teethType] && oldValue[teethType]) {
			// true -> false
			// 重新生成小球
			adjustDentalArchWidgetInScene("exit");
			regenerateDentalArchWidget([teethType]);
			adjustDentalArchWidgetInScene("enter");
		}
	}
});

const dentalArchAdjustRecord = store.state.actorHandleState.teethArrange.dentalArchAdjustRecord;
const dentalArchSettings = store.state.actorHandleState.teethArrange.dentalArchSettings;

/**
 * @description 更新当前选择的托槽名(到视图)
 */
function updateSelectBracket(bracketName) {
	store.dispatch("actorHandleState/updateCurrentSelectBracketName", bracketName);
}
const teethPositionAdjustStep = computed(() => store.state.actorHandleState.teethPositionAdjust.step);
const teethPositionAdjustAngle = computed(() => store.state.actorHandleState.teethPositionAdjust.angle);
const teethPositionAdjustMoveType = computed(() => store.state.actorHandleState.teethPositionAdjustMoveType);
// 牙齿咬合位置执行完毕时重置为空可接受下一次调整
function releaseTeethPositionAdjustMoveType() {
	store.dispatch("actorHandleState/updateTeethPositionAdjustMoveType", "");
}
watch(teethPositionAdjustMoveType, (newValue) => {
	if (newValue !== "") {
		teethPositionAdjust(newValue);
	}
});
function teethPositionAdjust(moveType) {
	if (
		!uploadType.value.includes("upper") &&
		toRaw(loadedBracketNameList.upper).includes(currentSelectBracket.name.value)
		// currentSelectBracket.name.value.startsWith("U")
	) {
		proxy.$message({
			message: "上颌牙数据已递交, 无法继续修改",
			type: "error",
		});
		releaseTeethPositionAdjustMoveType();
		return;
	}
	if (
		!uploadType.value.includes("lower") &&
		toRaw(loadedBracketNameList.lower).includes(currentSelectBracket.name.value)
		// currentSelectBracket.name.value.startsWith("L")
	) {
		proxy.$message({
			message: "下颌牙数据已递交, 无法继续修改",
			type: "error",
		});
		releaseTeethPositionAdjustMoveType();
		return;
	}
	// 细调操作
	let option = {
		moveStep: 0,
		moveType,
		teethType: teethPositionAdjustType.value,
	};
	console.log('option', option);
	if (moveType.includes("ANTI") || moveType.includes("ALONG")) {
		// 旋转
		option.moveStep = teethPositionAdjustAngle.value;
	} else {
		// 平移
		option.moveStep = teethPositionAdjustStep.value;
	}
	fineTuneTeethPosition(option);
}
const generateRootRecord = computed(() => cloneDeep(store.state.actorHandleState.generateRootRecord));
watch(generateRootRecord,(newValue, oldValue) => {
	for (let teethType of ['upper','lower']){
		if(newValue[teethType]&&!oldValue[teethType]){
			const elMessage = ElMessage({
				message: '正在生成虚拟牙根...',
				grouping: true,
				type: 'warning',
				duration: 0,
				showClose: true,
				offset: -7,
			})
			// 如果不加这个延时，elMessage会延迟一小会才显示
			setTimeout(()=>{
				generateRoot(teethType)
				.then((result) => {
					allActorList[teethType].rootGenerate = result.rootList;
					allActorList[teethType].originRoot = result.originRootList;
					const { renderWindow, renderer } = vtkContext;
					allActorList[teethType].rootGenerate.forEach(({actor})=>{
						renderer.addActor(actor)
					})
					renderWindow.render()
					elMessage.close()
				})
				.catch((error) => {
					console.error(error); // 处理错误情况
				});
			}, 50)
		}
		if(!newValue[teethType]&&oldValue[teethType]){
			// 清除牙根
			const { renderWindow, renderer } = vtkContext;
			allActorList[teethType].rootGenerate.forEach(({actor})=>{
				renderer.removeActor(actor)
			})
			renderWindow.render()
		}
	}
},
{ deep: true }
);

const { proxy } = getCurrentInstance();

let vtkContainer = ref(null);
let vtkContext = null; // 保存renderWindow
let vtkTextContainer = ref(null);

let vtkSegToothContainer = ref(null);
let vtkSegToothContext = null; // 保存renderWindow

let vtkPictureContainer = ref(null);
let vtkPictureContext = null;
let vtkPictureTextContainer = ref(null);

let showRightSidemenu = ref(false);
let initRenderCamera = false; // 初始模型加载需要重置一次镜头
let forceUpdateAtMode = ""; // 用于强制更新时的记录

let teethBiteworker = null;

const {
	userMatrixList,
	applyCalMatrix,
	teethAxisFinetuneRecord,
	initUserMatrixList,
	initApplyCalMatrix,
	updateSingleBracketUserMatrix,
	initMatrixForTeethAxisSphere,
	updateMatrixWhenFineTuneTeethPosition,
	updateMatrixAfterArrangeTeeth,
	updateApplyUserMatrixWhenSwitchMode,
} = userMatrixControl();

// let cameraFocalPoint = 0.0 // 记录相机焦点, 可在resetView中使用, 焦点通常在模型中心

const {
	allActorList,
	patientUID,
	progressConfig,
	currentStep,
	stlObj,
	xmlObj,
	toothPolyDatas,
	bracketPolyDatas,
	mainCameraConfigs,
	bracketData,
	updateDistanceLineActor,
	distanceMessageList,
	rotateMessageList,
	longAxisData,
} = asyncDataLoadAndParse(vtkTextContainer, userMatrixList, applyCalMatrix);
// applyCalMatrix用于对更新长轴点时生成的新坐标轴设置userMatrix
const {
	currentSelectBracket,
	adjustColorForHover,
	updateClickOnListSelectedActor,
	updateDbClickSelectedActor,
	exitSelection,
	actorShowStateUpdateFusion,
	actorShowStateUpdateSlicing,
	actorShowStateUpdateSlicingReset,
	axisActorShowStateUpdate,
	adjustActorWhenSwitchSimulationMode,
} = actorControl(allActorList);
const {
	generateRootDirection,
    adjustRootWidgetInScene,
	setGingivaOpacity,
	generateRoot,
    clearRoot,
} = rootFunc(allActorList,toothPolyDatas,bracketData);
const {
	SurroundingBoxs,
    generateBox,
	resetSurroundingBoxsPoints,
    resetSurroundingBoxs,
	fineTuneBoxPosition,
} = Slicing(toothPolyDatas, bracketData, currentSelectBracket, allActorList);
const {
	preFineTuneRecord, // 记录上次[模拟排牙]时托槽的微调位置, 用于[模拟排牙]模式的微调中
	currentArrangeStep,
	terminateArrangeWorker,
	postInitialDataToWorker,
	startTeethArrange,
	startTeethArrangeByAdjustedDentalArch,
	reCalculateDentalArchCoefficients,
	reScaleDentalArchCoefficients,
	usePresetDentalArchCoefficients,
} = asyncTeethArrange(allActorList);
const teethStandardAxis = store.state.actorHandleState.teethArrange.teethStandardAxis;
const resetTeethAxisFinetuneRecord = store.state.actorHandleState.teethArrange.teethAxisFinetuneRecord;
// const arrangeMatrixList =
//     store.state.actorHandleState.teethArrange.arrangeMatrix;
const arrangeMatrixList = computed(() => store.getters["actorHandleState/mergedArrangeMatrix"]);
// 挂载时设置环境renderer
onMounted(() => {
	// initArrangeWorker();
	initUserMatrixList(); // 初始化转换矩阵为全单位矩阵
	initApplyCalMatrix(); // 全单位矩阵
	// initApplyMatrixType()
	if (!vtkContext) {
		// 利用genericRenderWindow设置
		// RenderWindow/Renderer/OpenGLRenderWindow/Interactor/InteractorStyle
		const genericRenderer = vtkGenericRenderWindow.newInstance();
		genericRenderer.setContainer(vtkContainer.value);
		genericRenderer.setBackground([1.0, 1.0, 0.94]);
		// 尺寸自动缩放
		genericRenderer.resize();
		// 获取设置好的renderer和renderWindow
		const renderer = genericRenderer.getRenderer();
		const renderWindow = genericRenderer.getRenderWindow();

		const iStyle = vtkInteractorStyleTrackballCameraNew.newInstance();
		renderWindow.getInteractor().setInteractorStyle(iStyle);

		// 建立牙齿托槽选择器
		const interactor = renderWindow.getInteractor();
		const apiSpecificRenderWindow = interactor.getView();
		// Create hardware selector
		const hardwareSelector = apiSpecificRenderWindow.getSelector();
		hardwareSelector.setCaptureZValues(true);
		hardwareSelector.setFieldAssociation(FieldAssociations.FIELD_ASSOCIATION_POINTS);

		//#region 在左下角显示xyz坐标系方向
		const axes = vtkAxesActor.newInstance();
		axes.setXAxisColor(205, 50, 50);
		axes.setYAxisColor(50, 205, 50);
		axes.setZAxisColor(50, 50, 205);
		axes.setConfig({
			invert: false,
			shaftRadius: 0.01,
			shaftResolution: 30,
			tipLength: 0.2,
			tipRadius: 0.06,
			tipResolution: 30,
		});
		axes.update();
		const orientationWidget = vtkOrientationMarkerWidget.newInstance({
			actor: axes,
			interactor: renderWindow.getInteractor(),
		});

		orientationWidget.setEnabled(true);
		orientationWidget.setViewportCorner(vtkOrientationMarkerWidget.Corners.BOTTOM_LEFT);
		orientationWidget.setViewportSize(0.15); // 尺寸
		orientationWidget.setMinPixelSize(15); // 最小尺寸
		orientationWidget.setMinPixelSize(100); // 最大尺寸
		//#endregion

		// 保存绘制窗口的renderer和rendererWindow
		vtkContext = {
			genericRenderer,
			renderWindow,
			renderer,
			interactor,
			hardwareSelector,
			orientationWidget,
			axes,
		};
	}

	// 构建单牙齿窗口
	if (!vtkSegToothContext) {
		// 利用genericRenderWindow设置
		// RenderWindow/Renderer/OpenGLRenderWindow/Interactor/InteractorStyle
		const genericRenderer = vtkGenericRenderWindow.newInstance();
		genericRenderer.setContainer(vtkSegToothContainer.value);
		genericRenderer.setBackground([1.0, 1.0, 0.94]);
		// 尺寸自动缩放
		genericRenderer.resize();
		// 获取设置好的renderer和renderWindow
		const renderer = genericRenderer.getRenderer();
		const renderWindow = genericRenderer.getRenderWindow();

		const iStyle = vtkInteractorStyleTrackballCameraNew.newInstance();
		renderWindow.getInteractor().setInteractorStyle(iStyle);

		// 保存绘制窗口的renderer和rendererWindow
		vtkSegToothContext = {
			genericRenderer,
			renderWindow,
			renderer,
		};
	}
	// 构建全景图窗口
	if (!vtkPictureContext) {
		// 利用genericRenderWindow设置
		// RenderWindow/Renderer/OpenGLRenderWindow/Interactor/InteractorStyle
		const genericRenderer = vtkGenericRenderWindow.newInstance();
		genericRenderer.setContainer(vtkPictureContainer.value);
		genericRenderer.setBackground([1.0, 1.0, 0.94]);
		// 尺寸自动缩放
		genericRenderer.resize();
		// 获取设置好的renderer和renderWindow
		const renderer = genericRenderer.getRenderer();
		const renderWindow = genericRenderer.getRenderWindow();

		const iStyle = vtkInteractorStyleImage.newInstance();
		iStyle.setInteractionMode("IMAGE_SLICING");

		renderWindow.getInteractor().setInteractorStyle(iStyle);

		// 保存绘制窗口的renderer和rendererWindow
		vtkPictureContext = {
			genericRenderer,
			renderWindow,
			renderer,
		};
	}
});

// 如果是新主题，必须监视themeType的变化来更新，因为omMounted时变量值还没发生改变
watch(themeType, (newVal) => {
	vtkContext.genericRenderer.setBackground([0.97, 0.97, 0.95]);
	vtkSegToothContext.genericRenderer.setBackground([0.97, 0.97, 0.95]);
	vtkPictureContext.genericRenderer.setBackground([0.97, 0.97, 0.95]);
	vtkContext.renderWindow.render()
	vtkSegToothContext.renderWindow.render()
	vtkPictureContext.renderWindow.render()
});

onBeforeUnmount(() => {
	terminateArrangeWorker();
});

function openBracketSelection() {
	// 为vtkContainer创建每隔至少100ms才能被调用的鼠标移动事件
	// 用于用户鼠标在某actor上移动时有绿色高亮
	vtkContainer.value.addEventListener("mousemove", throttleMouseHandler);
	// 为vtkContainer创建鼠标双击事件
	// 用于用户选择操作某个牙齿托槽
	vtkContainer.value.addEventListener("dblclick", selectOnDbClickMouseEvent);
}

function closeBracketSelection() {
	// 撤销当前选择
	const { renderWindow } = vtkContext;
	exitSelection();
	segToothWindowFlush();
	updateSelectBracket(currentSelectBracket.name);

	renderWindow.render();

	vtkContainer.value.removeEventListener("mousemove", throttleMouseHandler);
	vtkContainer.value.removeEventListener("dblclick", selectOnDbClickMouseEvent);
}
// 每隔至少100ms才能被调用的鼠标移动事件
// 用于用户鼠标在某actor上移动时有绿色高亮
const throttleMouseHandler = throttle(pickOnMouseEvent, 100);

function generateBoxTool(vtkContext, actors){
	if (vtkContext.renderer && vtkContext.renderWindow) {
        vtkContext.renderer.addActor(actors); // 以新的actor移入屏幕触发mapper重新根据输入数据计算
		vtkContext.renderWindow.render();
	}
}
function resetgenerateBoxTool(vtkContext, actors){
	for (let i = 0; i < actors.length; i++) {
  		vtkContext.renderer.removeActor(actors[i]); // 假设 renderer 是你的渲染器对象
	}
}
function resetgenerateBoxToolTune(vtkContext, Tuneactors){
	// for (let i = 0; i < Tuneactors.length; i++) {
  	// 	vtkContext.renderer.removeActor(Tuneactors[i]); // 假设 renderer 是你的渲染器对象
	// }
	// 设置透明度（0 到 1 之间的值，0 表示完全透明，1 表示完全不透明）
	// 遍历所有的 actors 并设置透明度
	for (let i = 0; i < Tuneactors.length; i++) {
		const actor = Tuneactors[i];
    	// 设置透明度
		actor.getProperty().setOpacity(0);
}
}
const boxPositionAdjustStep = computed(() => store.state.actorHandleState.BoxSlicing.boxPositionAdjust.step);

const boxPositionAdjustType = computed(() => store.state.actorHandleState.BoxSlicing.boxPositionAdjust.teethType);
watch(boxPositionAdjustType, (newVal, oldVal) => {
	adjustTeethAxisSphereActorInScene("switch", newVal, oldVal);
});

function setavailableToothSides(value){
	store.dispatch("actorHandleState/updataSelectedTooth", value);
}

/**
 * @description 当对网页进行缩放时,其实质为调整分辨率,
 * 如对于一个缩放比例为200%的网页来说,其实是把网页里面的每个像素(pixel/px)尺寸调整为原来的2*2,
 * 此时对于一个占300px宽的栏目来说它就会显示为600px宽,实际上还是300px宽,只是每个px放大了两倍,
 * window.devicePixelRatio可以读取当前网页缩放比例,
 * >> window.innerWidth,window.innerHeight可以读取网页当前内部布局的分辨率,
 * 对一个原分辨率为800*600的网页, 缩放比例如果是200%,那么：
 * window.innerWidth=400,window.innerHeight=200
 * >> mouse event中的offsetX,offsetY是按照原分辨率走的,以添加事件的html元素左上角为(0,0),横x|纵y
 * 如果你将鼠标放在800px*600px的该html元素正中间,如果缩放比例100%,那么offsetX,Y=(400,300)
 * 如果缩放比例200%, offsetX,Y=(200,150)
 * >> 对于vtk renderwindow来说,它内部分辨率不会随缩放比例的改变而改变,始终固定,
 * 其中坐标以左下角为(0,0), 横x|纵y, 对于一个800*600的canvas容器,只要尺寸固定
 * 其内部display坐标始终为左下角(0,0),右上角(800,600)
 * 如果收到网页缩放而尺寸改变,左下角始终是(0,0),右上角坐标始终是容器长宽
 * eventToWindowXY需要计算出鼠标在canvas容器中的display坐标
 * 注：如果网页缩放过大,导致滑动条出现,canvas整体无法完全显示时display坐标,会出错,(canvas size计算失误)
 *
 *
 */
function eventToWindowXY(event) {
	const { interactor } = vtkContext;
	let { offsetX, offsetY } = event;
	if (browserType() === "Firefox") {
		// 火狐不支持offsetX, offsetY 需要手动计算
		// 获得父元素相对页面偏移
		let { offsetLeft, offsetTop } = getOffsetForFirefox(event.target);
		// 获得鼠标相对页面page坐标
		let { pageX, pageY } = event;
		offsetX = pageX - offsetLeft;
		offsetY = pageY - offsetTop;
	}
	// // 全浏览器
	// let {offsetLeft, offsetTop} = getOffsetForFirefox(event.target)
	// 获得鼠标相对页面page坐标
	// let {pageX, pageY} = event
	// let offsetX = pageX - offsetLeft
	// let offsetY = pageY - offsetTop

	// vtkContainer尺寸(网页分辨率为1)
	const height = interactor.getView().getSize()[1]; // [width, height]
	// 整个网页尺寸
	// const x = Math.round(
	//     (clientX - (window.innerWidth - width/window.devicePixelRatio))*window.devicePixelRatio
	// )
	// const y = Math.round(
	//     height - (clientY - (window.innerHeight - height/window.devicePixelRatio))*window.devicePixelRatio
	// ) // Need to flip Y
	// window.devicePixelRatio: 页面缩放比例
	const x = Math.round(offsetX * window.devicePixelRatio);
	const y = Math.round(height - offsetY * window.devicePixelRatio); // Need to flip Y

	return [x, y];
}
function getOffsetForFirefox(element) {
	let node = element;
	let offsetOfElement = { offsetLeft: 0, offsetTop: 0 };
	while (node !== null && node.offsetLeft !== undefined && node.offsetTop !== undefined) {
		offsetOfElement.offsetLeft += node.offsetLeft;
		offsetOfElement.offsetTop += node.offsetTop;
		node = node.offsetParent;
	}
	return offsetOfElement;
}
function pickOnMouseEvent(event) {
	if (vtkContext) {
		const { genericRenderer, renderer, interactor, hardwareSelector } = vtkContext;
		genericRenderer.resize();
		if (interactor.isAnimating()) {
			// 在交互时不应该触发选择事件
			// We should not do picking when interacting with the scene
			return;
		}
		const [x, y] = eventToWindowXY(event);
		hardwareSelector.getSourceDataAsync(renderer, x, y, x, y).then((result) => {
			if (result) {
				processSelections(result.generateSelection(x, y, x, y));
			} else {
				processSelections(null);
			}
		});
	}
}
function processSelections(selections) {
	const { renderWindow } = vtkContext;

	adjustColorForHover(selections);
	renderWindow.render();
}

// 为vtkContainer创建鼠标双击事件
// 用于用户选择操作某个牙齿托槽
function selectOnDbClickMouseEvent(event) {
	if (vtkContext) {
		const { renderer, interactor, hardwareSelector } = vtkContext;
		if (interactor.isAnimating()) {
			// 在交互时不应该触发选择事件
			// We should not do picking when interacting with the scene
			return;
		}
		const [x, y] = eventToWindowXY(event);
		hardwareSelector.getSourceDataAsync(renderer, x, y, x, y).then((result) => {
			if (result) {
				updateSelectedBracketActor(result.generateSelection(x, y, x, y));
			}
		});
	}
}
function updateSelectedBracketActor(selections) {
	const { renderWindow } = vtkContext;

	updateDbClickSelectedActor(selections);
	segToothWindowFlush();
	updateSelectBracket(currentSelectBracket.name);
	if (currentSelectBracket.actor !== null) {
		focusOnSelectedBracket();
	}
	renderWindow.render();
}
function updateSelectedBracketActorByListClick(bracketName) {
	const { renderWindow } = vtkContext;
	updateClickOnListSelectedActor(bracketName);
	segToothWindowFlush();
	updateSelectBracket(currentSelectBracket.name);
	if (currentSelectBracket.actor !== null) {
		focusOnSelectedBracket();
	}
	renderWindow.render();
}

watch(isInFineTuneMode, (newVal) => {
	showRightSidemenu.value = newVal;
});

// 用于监听当前选中托槽的改变(需要旧值和新值), 用于对应坐标轴actor的添加和移除
let actors = [];
let boxpoints = [];
let Tuneactor = [];
watch(
	() => currentSelectBracket.name,
	(newVal, oldVal) => {
		// 选中托槽的变化清空有3种: 空->托槽, 托槽->另一托槽, 托槽->空
		// 空->托槽, 需要add
		// 托槽->空, 需要remove
		// 托槽->另一托槽, 需要add和remove
		if (currentShowPanel.value !== 3){
			setavailableToothSides('false');
			resetSurroundingBoxsPoints();
			const { addActorsList, delActorsList } = axisActorShowStateUpdate(oldVal, newVal, props.actorInScene.axis);
			actorInSceneAdjust(addActorsList, delActorsList);
			// 托槽->空时需要清除距离文字
			if (newVal === "") {
				const dims = vtkTextContainer.value.getBoundingClientRect();
				const textCtx = vtkTextContainer.value.getContext("2d");
				textCtx.clearRect(0, 0, dims.width, dims.height);
		}}
		else{
			if (oldVal === "" && newVal !== "") {
				if (actors.length !== 0){
					resetgenerateBoxTool(vtkContext, actors);
				}
				if (Tuneactor.length !== 0){
					resetgenerateBoxToolTune(vtkContext, Tuneactor);
				}
				// vtkContext.renderWindow.render();
				boxpoints = SurroundingBoxs(toothPolyDatas, bracketData, currentSelectBracket, allActorList);
				setavailableToothSides('true');
				actors = generateBox(boxpoints);
				generateBoxTool(vtkContext, actors);
				}
			if (oldVal !== "" && newVal !== ""){
				if (Tuneactor.length !== 0){
					resetgenerateBoxToolTune(vtkContext, Tuneactor);
				}
				resetgenerateBoxTool(vtkContext, actors);
				// vtkContext.renderWindow.render();
				boxpoints = SurroundingBoxs(toothPolyDatas, bracketData, currentSelectBracket, allActorList);
				setavailableToothSides('true');
				actors = generateBox(boxpoints);
				generateBoxTool(vtkContext, actors);
				}
			if (oldVal !== "" && newVal === ""){
				if (Tuneactor.length !== 0){
					resetgenerateBoxToolTune(vtkContext, Tuneactor);
				}
				setavailableToothSides('false');
				resetSurroundingBoxsPoints();
				resetgenerateBoxTool(vtkContext, actors);
				vtkContext.renderWindow.render();
				}
			}
		}
);

const boxPositionAdjustPositionAdjustStep = computed(() => store.state.actorHandleState.BoxSlicing.boxPositionAdjust.step);
const boxPositionAdjustMoveType = computed(() => store.state.actorHandleState.BoxSlicing.boxPositionAdjustMoveType);
// 牙齿咬合位置执行完毕时重置为空可接受下一次调整
function releaseBoxPositionAdjustMoveType() {
	// 0314更改
	if (boxPositionAdjustMoveType !== "TEMPRESET"){
		store.dispatch("actorHandleState/updateBoxPositionAdjustMoveType", "");
	}
	
}

let boxpointsAdjust = [];

function boxPositionAdjust(moveType) {
	// if (moveType == 'Generate'){
	// 	const SurroundingBoxsPoints = store.state.actorHandleState.BoxSlicing.boxPositionAdjust.BoxPoints;
		
	// 	// const { pointValues, cellValues, copiedtoothPolyDatas, validpointValues, validcellValues} = FineTunePiece(toothPolyDatas, currentSelectBracket, SurroundingBoxsPoints);
	// 	const { pointValues, cellValues} = FineTunePiece(toothPolyDatas, currentSelectBracket, SurroundingBoxsPoints);
	// 	// 得到一个修改后的单个牙齿面片组成数据，生成切割后的牙齿
	// 	Tuneactor = reshowTune(pointValues, cellValues);
	// 	generateBoxTool(vtkContext, Tuneactor);
	// 	releaseBoxPositionAdjustMoveType();
	// 	return;
	// }
	// if (
	// 	!uploadType.value.includes("upper") &&
	// 	toRaw(loadedBracketNameList.upper).includes(currentSelectBracket.name.value)
	// 	// currentSelectBracket.name.value.startsWith("U")
	// ) {
	// 	proxy.$message({
	// 		message: "上颌牙数据已递交, 无法继续修改",
	// 		type: "error",
	// 	});
	// 	releaseTeethPositionAdjustMoveType();
	// 	return;
	// }
	// if (
	// 	!uploadType.value.includes("lower") &&
	// 	toRaw(loadedBracketNameList.lower).includes(currentSelectBracket.name.value)
	// 	// currentSelectBracket.name.value.startsWith("L")
	// ) {
	// 	proxy.$message({
	// 		message: "下颌牙数据已递交, 无法继续修改",
	// 		type: "error",
	// 	});
	// 	releaseTeethPositionAdjustMoveType();
	// 	return;
	// }
	// 细调操作
	if (store.state.actorHandleState.BoxSlicing.BoxPoints.length != 0){
		let boxpoint = store.state.actorHandleState.BoxSlicing.BoxPoints; //有值
		let boxpointsAdjust = [boxpoint.Point0, boxpoint.Point1, boxpoint.Point2, boxpoint.Point3, boxpoint.Point4, boxpoint.Point5, boxpoint.Point6, boxpoint.Point7];
		boxpointsAdjust = fineTuneBoxPosition(moveType, boxpointsAdjust);
		store.dispatch("actorHandleState/updateSurroudingBoxs", boxpointsAdjust);
		actors = generateBox(boxpointsAdjust);
		generateBoxTool(vtkContext, actors);
	}
}

watch(boxPositionAdjustMoveType, (newValue) => {
	if (newValue !== "" & newValue !== 'Generate' & newValue !== "TEMPRESET" & newValue !== "RESET") {
		resetgenerateBoxTool(vtkContext, actors);
		boxPositionAdjust(newValue);
		releaseBoxPositionAdjustMoveType();
	}
	if (newValue == 'Generate'){
		//删除形成的包围框
		resetgenerateBoxTool(vtkContext, actors);

		const SurroundingBoxsPoints = store.state.actorHandleState.BoxSlicing.boxPositionAdjust.BoxPoints;
		const toothPosition = store.state.actorHandleState.BoxSlicing.SelectedPosition;
		// //版本2
		// const { validpointValues, validcellValues } = FineTunePiece(toothPolyDatas, currentSelectBracket, toothPosition, SurroundingBoxsPoints);
		// const { actor, mapper, polyData } = generateActorByData({ validpointValues, validcellValues});
		// //需要生成的单颗牙齿名称
		// const ToothSlicingName = currentSelectBracket.name;
		// allActorList[ToothSlicingName].tooth = {
		// 	actor: actor,
		// 	mapper: mapper,
		// };
		// const { pointValues, cellValues, copiedtoothPolyDatas, validpointValues, validcellValues} = FineTunePiece(toothPolyDatas, currentSelectBracket, toothPosition, SurroundingBoxsPoints);
		const { pointValues, cellValues, truncatedValidcellValues} = FineTunePiece(toothPolyDatas, currentSelectBracket, toothPosition, SurroundingBoxsPoints);
		// truncatedValidcellValues = FineTunePiece(toothPolyDatas, currentSelectBracket, toothPosition, SurroundingBoxsPoints);
		
		//得到一个修改后的单个牙齿面片组成数据，生成切割后的牙齿
		const FineTuneactor = reshowTune(pointValues, truncatedValidcellValues);
		// generateBoxTool(vtkContext, Tuneactor);
		const { addActorsList, delActorsList } = actorShowStateUpdateSlicing(props.actorInScene, FineTuneactor);
		actorInSceneAdjust(addActorsList, delActorsList);
		releaseBoxPositionAdjustMoveType();
	}
	if (newValue == 'TEMPRESET'){
		// const FineTuneactor = generateSlicingBoxReset();
		// const { addActorsList, delActorsList } = actorShowStateUpdateSlicing(props.actorInScene, FineTuneactor);
		const { addActorsList, delActorsList } = actorShowStateUpdateSlicingReset(props.actorInScene, toothPolyDatas, store, 'TEMPReset');
		actorInSceneAdjust(addActorsList, delActorsList);
		releaseBoxPositionAdjustMoveType();
	}
	if (newValue == 'RESET'){
		const { addActorsList, delActorsList } = actorShowStateUpdateSlicingReset(props.actorInScene, toothPolyDatas, store, 'Reset');
		actorInSceneAdjust(addActorsList, delActorsList);
		releaseBoxPositionAdjustMoveType();
	}
});

function generateSlicingBoxReset(){
	const toothName = currentSelectBracket.name;
	const pointValues = toothPolyDatas[toothName].getPoints().getData();
	const cellValues = toothPolyDatas[toothName].getPolys().getData();
	const FineTuneactor = reshowTune(pointValues, cellValues);
	return {FineTuneactor}
}

function actorShowStateUpdateSlicingTEMPReset(){
	const toothName = currentSelectBracket.name;
	const pointValues = toothPolyDatas[toothName].getPoints().getData();
	const cellValues = toothPolyDatas[toothName].getPolys().getData();
	const FineTuneactor = reshowTune(pointValues, cellValues);
}

function generateActorByData({ pointValues, cellValues }) {
        const polyData = vtkPolyData.newInstance();
        polyData.getPoints().setData(pointValues);
        polyData.getPolys().setData(cellValues);

        const mapper = vtkMapper.newInstance();
        mapper.setInputData(polyData);
        const actor = vtkActor.newInstance();
        actor.setMapper(mapper);
        return { actor, mapper, polyData };
    }

// function reshowTune(copiedtoothPolyDatas){
// 	const polydata = vtkPolyData.newInstance();
// 	const points = vtkPoints.newInstance();

// 	const cellArray = vtkCellArray.newInstance();
	
// 	const mapper = vtkMapper.newInstance();

// 	const Tuneactor = vtkActor.newInstance();

// 	for (let name in copiedtoothPolyDatas){
// 		const pointValues = copiedtoothPolyDatas[name];
// 		const cellValues = copiedtoothPolyDatas[name];
// 		points.setData(Float32Array.from(pointValues));
// 		polydata.setPoints(points);

// 		const cellData = new Uint32Array(cellValues);
// 		cellArray.setData(cellData);
// 		polydata.setPolys(cellArray);

// 		mapper.setInputData(polydata);

// 		Tuneactor.setMapper(mapper);
// 		Tuneactor.getProperty().setColor(1, 0, 0);
// 		break;
// 	}
// 	return Tuneactor;
// }
function reshowTune(pointValues, cellValues){
	const polydata = vtkPolyData.newInstance();
	const points = vtkPoints.newInstance();
	points.setData(Float32Array.from(pointValues));
	polydata.setPoints(points);

	const cellArray = vtkCellArray.newInstance();
	const cellData = new Uint32Array(cellValues);
    cellArray.setData(cellData);

    polydata.setPolys(cellArray);

	const mapper = vtkMapper.newInstance();
	mapper.setInputData(polydata);

	const Tuneactor = vtkActor.newInstance();
	Tuneactor.setMapper(mapper);
	Tuneactor.getProperty().setColor(1, 1, 1);
	// Tuneactor.getProperty().setColor(colorConfig.teeth);
    Tuneactor.getProperty().setOpacity(store.state.actorHandleState.toothOpacity);
	// Tuneactor.getProperty().setOpacity(toothOpacity/100);

	return Tuneactor;
}

// 用于监听显示/隐藏状态改变
watch(props.actorInScene, (newVal) => {
	const { addActorsList, delActorsList } = actorShowStateUpdateFusion(newVal, fineTuneMode.value !== "normal");
	actorInSceneAdjust(addActorsList, delActorsList);
	if (vtkContext && !initRenderCamera) {
		const { renderWindow, renderer } = vtkContext;
		// 初始加载需要调整一次镜头
		let teethType = newVal.upper ? "upper" : "lower";
		// 重置镜头
		renderer.resetCamera();
		renderWindow.render();

		// 添加复位用相机参数(参数里目前只有view上下左右)
		let mainCamera = renderer.getActiveCamera();
		mainCameraConfigs[teethType].position = mainCamera.getPosition();
		mainCameraConfigs[teethType].focalPoint = mainCamera.getFocalPoint();

		// 正面朝前
		// 注：首次重置视角时会有显示不全(切割/clip/模型截断)的问题,故此处重复2次
		resetView("FRONT", teethType);
		resetView("FRONT", teethType);

		// 若有全景图, 则初始加载全景图到右下窗口(后不变)
		if (allActorList.picture) {
			const { actor: picActor, mapper: picMapper } = allActorList.picture;
			vtkPictureContext.renderer.addActor(picActor);

			const camera = vtkPictureContext.renderer.getActiveCamera();
			const position = camera.getFocalPoint();
			// offset along the slicing axis
			const normal = picMapper.getSlicingModeNormal();
			position[0] += normal[0];
			position[1] += normal[1];
			position[2] += normal[2];
			camera.setPosition(...position);
			camera.setViewUp([0, 1, 0]);
			camera.setParallelProjection(true);
			vtkPictureContext.renderer.resetCamera();

			vtkPictureContext.renderWindow.render();
		} else {
			const dims = vtkPictureTextContainer.value.getBoundingClientRect();
			vtkPictureTextContainer.value.setAttribute("width", dims.width);
			vtkPictureTextContainer.value.setAttribute("height", dims.height);
			const textCtx = vtkPictureTextContainer.value.getContext("2d");
			if (textCtx && dims) {
				textCtx.clearRect(0, 0, dims.width, dims.height);
				textCtx.font = "30px 微软雅黑";
				textCtx.textAlign = "center";
				textCtx.textBaseline = "middle";
				textCtx.fillStyle = "#67c23a";
				textCtx.fillText("未检测到全景图", dims.width / 2, dims.height / 2);
			}
		}

		// 加入widget
		for (let teethType of ["upper", "lower"]) {
			allActorList[teethType].distanceLine.forEach((item) => {
				item.startPointRep.setFuncRenderer(renderer);
				item.startPointRep.setFuncRenderWindow(renderWindow);
				item.startPointWidget.setInteractor(renderWindow.getInteractor());
				item.startPointWidget.setEnabled(0);
				item.endPointRep.setFuncRenderer(renderer);
				item.endPointRep.setFuncRenderWindow(renderWindow);
				item.endPointWidget.setInteractor(renderWindow.getInteractor());
				item.endPointWidget.setEnabled(0);
			});
		}

		// 左下角xyz坐标轴指示设置矩阵变换
		const { viewUp, viewRight, viewFront } = mainCameraConfigs[teethType];

		// test结果: [绿向前, 蓝向右, 红向上] -> 目标: [蓝向前, 红向右, 绿向上]
		// 已知变换[xNormal(0,0,1),yNormal(1,0,0),zNormal(0,1,0)]->[viewRight,viewUp,viewFront]
		// 的结果是[绿向前, 蓝向右, 红向上]
		// 则还需要一次 {绿, 蓝, 红} -> {蓝, 红, 绿} 的变换
		// 即 [xNormal,yNormal,zNormal] -> [yNormal,zNormal,xNormal]的变换
		// 两个变换可以交换顺序
		// 因此总变换为 [yNormal,zNormal,xNormal] ->[viewRight,viewUp,viewFront]
		// 等效于 [xNormal,yNormal,zNormal] -> [viewFront,viewRight,viewUp]
		// vtkContext.axes.setUserMatrix(
		//     calculateRigidBodyTransMatrix(
		//         [0,0,0],
		//         viewRight,
		//         viewUp,
		//         viewFront
		//     ))
		vtkContext.axes.setUserMatrix(calculateRigidBodyTransMatrix([0, 0, 0], viewFront, viewRight, viewUp));
		// 坐标轴需要转换角度调整, 否则尺寸对不上
		resetView("LEFT", teethType);
		resetView("FRONT", teethType);

		renderWindow.render();
		initRenderCamera = true;
	}
});

let finishLoad = computed(() => {
	let upperType = progressConfig.upper[currentStep.upper].state.type;
	let lowerType = progressConfig.lower[currentStep.lower].state.type;
	return upperType !== "wait" && lowerType !== "wait" && (upperType === "success" || lowerType === "success");
});

watch(finishLoad, (newVal) => {
	if (newVal) {
		let upperType = progressConfig.upper[currentStep.upper].state.type;
		let lowerType = progressConfig.lower[currentStep.lower].state.type;
		if (upperType === "success") {
			store.dispatch("userHandleState/updateLoadBracketName", {
				teethType: "upper",
				bracketNameList: bracketData.upper.map((item) => item.name),
			});
			store.dispatch("userHandleState/updateLoadedTeethType", {
				teethType: "upper",
				value: true,
			});
		}
		if (lowerType === "success") {
			store.dispatch("userHandleState/updateLoadBracketName", {
				teethType: "lower",
				bracketNameList: bracketData.lower.map((item) => item.name),
			});
			store.dispatch("userHandleState/updateLoadedTeethType", {
				teethType: "lower",
				value: true,
			});
		}
		postInitialDataToWorker(
			{
				tooth: toothPolyDatas,
				bracket: bracketPolyDatas,
			},
			longAxisData
		);
	}
});

// 制造加载信息返回上级{上颌牙, 下颌牙}
watchEffect(() => {
	// 如果某一步出错时则不再考虑
	let typeOfUpper = progressConfig.upper[currentStep.upper].state.type;
	let typeOfLower = progressConfig.lower[currentStep.lower].state.type;
	let numUpperStep =
		typeOfUpper !== "error" && typeOfUpper !== "deactive" ? Object.keys(progressConfig.upper).length : 0;
	let numLowerStep =
		typeOfLower !== "error" && typeOfLower !== "deactive" ? Object.keys(progressConfig.lower).length : 0;
	let totalProgress = numUpperStep + numLowerStep;

	let currentUpperProgress = typeOfUpper !== "error" && typeOfUpper !== "deactive" ? currentStep.upper + 1 : 0;
	let currentLowerProgress = typeOfLower !== "error" && typeOfLower !== "deactive" ? currentStep.lower + 1 : 0;

	let currentProgress = currentUpperProgress + currentLowerProgress; // 0123456789

	props.changeLoadingMessage({
		upper: progressConfig.upper[currentStep.upper].state,
		lower: progressConfig.lower[currentStep.lower].state,
		loadingProgress: currentProgress + "/" + totalProgress,
	});
});

/**
 * @description 根据添加列表和移除列表调整屏幕中的actor
 */
function actorInSceneAdjust(addActorsList, delActorsList) {
	if (vtkContext) {
		const { renderWindow, renderer } = vtkContext;
		// 添加actor
		addActorsList.forEach((actor) => {
			if (actor) {
				renderer.addActor(actor);
			}
		});
		delActorsList.forEach((actor) => {
			if (actor) {
				renderer.removeActor(actor);
			}
		});
		renderWindow.render();
	}
}

/**
 * @description 当更新currentSelectedBracket时调用, 在子窗口中显示对应牙齿+托槽
 * camera distance: 焦点的屏幕深度
 * removeAllActors->addActor*2->镜头设置
 */
function segToothWindowFlush() {
	const { name: bracketName, actor } = currentSelectBracket;
	const { renderer, renderWindow } = vtkSegToothContext;
	// 删除所有actor
	renderer.removeAllActors();
	if (bracketName !== "") {
		// 寻找并添加2个actor并重置镜头
		renderer.addActor(actor);
		for (let teethType of ["upper", "lower"]) {
			allActorList[teethType].tooth.forEach((item) => {
				const { name, actor } = item;
				if (bracketName === name) {
					renderer.addActor(actor);
				}
			});
		}

		// 托槽初始读入的各项配置(所有托槽统一)
		let { name } = currentSelectBracket;
		let curTeethType = toRaw(loadedBracketNameList.upper).includes(name) ? "upper" : "lower";
		let focalPoint = [0, 0, 0]; // 镜头中心对准托槽中心
		let viewUp = [curTeethType === "upper" ? -1 : 1, 0, 0]; // 镜头向上打的角度向量
		let zNormal = [0, 1, 0]; // 镜头向前指的向量, 后续用于计算镜头位置(完整显示托槽)

		// 读取当前选中托槽actor的UserMatrix
		// 变换各项数据
		vtkMatrixBuilder
			.buildFromDegree()
			.setMatrix(actor.getUserMatrix())
			.apply(focalPoint)
			.apply(viewUp)
			.apply(zNormal);
		// 注意其中normal相对于center而言
		subtract(viewUp, focalPoint, viewUp);
		subtract(zNormal, focalPoint, zNormal);

		// 获取当前镜头
		let camera = renderer.getActiveCamera();

		// 设置当前镜头角度,使选择托槽垂直于屏幕(yNormal-上下)
		// 使镜头[上]方向与yNormal托槽沿上下法向量 平齐
		camera.setViewUp(viewUp);
		// 设置镜头焦点为托槽中心点,使托槽居中屏幕(actor绕焦点旋转)
		camera.setFocalPoint(...focalPoint);

		// 定义镜头距离屏幕(物体近大远小)
		let focalDistance = 20;
		// 计算在当前镜头焦点和方向下的镜头位置(得到选中牙齿托槽正对屏幕的位置)
		// 托槽与镜头焦点在中心,沿zNormal(前后)移动ficalDistance距离(越小目标越近(越大))
		let finalPos = calculateByScale(focalPoint, zNormal, focalDistance);
		// 设置镜头位置(由于焦点固定,所以无法呈现在屏幕中间)
		camera.setPosition(...finalPos);
		// 相机可显示距离
		camera.setClippingRange(1, 1000);
	}
	renderWindow.render();
}

function findSelectedBracketData() {
	let { name: bracketName } = currentSelectBracket;
	let matchData = null;
	for (let teethType of ["upper", "lower"]) {
		bracketData[teethType].forEach((item) => {
			const { name } = item;
			if (bracketName === name) {
				matchData = item;
			}
		});
	}

	return matchData; // 浅拷贝(item是对象)
}

/**
 * @description 重置某个托槽位置
 */
function resetSingleBracket() {
	const { renderer, renderWindow } = vtkContext;
	const matchData = findSelectedBracketData();
	const { name } = currentSelectBracket;
	const {
		position: { center, xNormal, yNormal, zNormal },
	} = matchData; // 读取托槽原中心及角度

	matchData.fineTuneRecord = {
		actorMatrix: {
			// 决定托槽本身角度的法向量方向(定位中心+角度轴), 同时作为托槽进行平移、旋转时所依赖的法向量方向(移动轴)
			center: [...center],
			xNormal: [...xNormal],
			yNormal: [...yNormal],
			zNormal: [...zNormal],
		},
	};
	// 托槽变换
	updateAndApplySingleBracketUserMatrix(name, matchData.fineTuneRecord.actorMatrix, fineTuneMode.value);

	renderWindow.render();
	// 子窗口跟着变
	vtkSegToothContext.renderWindow.render();

	// 重新计算距离 + 更新距离文字
	updateDistanceLineActor(name, center, zNormal, xNormal, renderer, renderWindow);
}
/**
 * @description 重置所有托槽位置
 */
function resetAllBracket() {
	const { renderer, renderWindow } = vtkContext;
	const selectBracketName = currentSelectBracket.name;
	for (let teethType of ["upper", "lower"]) {
		bracketData[teethType].forEach((item) => {
			const { name, position } = item;
			const { center, xNormal, yNormal, zNormal } = position;
			updateAndApplySingleBracketUserMatrix(name, position, fineTuneMode.value);
			item.fineTuneRecord = {
				actorMatrix: {
					// 决定托槽本身角度的法向量方向(定位中心+角度轴), 同时作为托槽进行平移、旋转时所依赖的法向量方向(移动轴)
					center: [...center],
					xNormal: [...xNormal],
					yNormal: [...yNormal],
					zNormal: [...zNormal],
				},
			};
			if (name === selectBracketName) {
				// 重新计算距离 + 更新距离文字
				updateDistanceLineActor(name, center, zNormal, xNormal, renderer, renderWindow);
			} else {
				// 当前无选中托槽, 仅更新距离
				updateDistanceLineActor(name, center, zNormal, xNormal);
			}
		});
	}

	renderWindow.render();
	// 子窗口跟着变
	vtkSegToothContext.renderWindow.render();
}

/**
 * @description 决定镜头根据上颌牙还是下颌牙来,
 * 如果距离门牙的位置一样则返回targetTeethType,
 * 但如果上颌牙UL3, 下颌牙LL1, 则每次都返回 'lower',
 * @param targetTeethType 'upper' | 'lower'
 */
function getMainCameraTeethType(targetTeethType) {
	// 如果上颌牙或下颌牙没有加载完, 此时无需比较
	if (!mainCameraConfigs.upper || !mainCameraConfigs.lower) {
		return targetTeethType;
	}
	// 如果两个配置都有, 则比较牙齿名字, 越接近门牙优先级越高,(XX1最高) 如果优先级一样就遵循targetTeethType
	let { base: upperBase } = mainCameraConfigs.upper;
	let { base: lowerBase } = mainCameraConfigs.lower;
	if (upperBase[2] < lowerBase[2]) {
		// 如 UL1 < LL3
		return "upper";
	} else if (lowerBase[2] < upperBase[2]) {
		// 如 LL1 < UL3
		return "lower";
	}
	return targetTeethType;
}
/**
 * @description 重置视角, 可设置是否保持镜头焦点距离不变
 */
function resetView(orientationType, teethType, keepFocalDis = false) {
	const { renderer, renderWindow, orientationWidget } = vtkContext;
	// 读取镜头方向
	let { base, viewUp, viewFront, viewLeft, viewRight } = mainCameraConfigs[getMainCameraTeethType(teethType)];
	let focalDis;
	if (keepFocalDis) {
		focalDis = renderer.getActiveCamera().getDistance();
	}

	// 镜头距离重置
	renderer.resetCamera();
	// 获取当前镜头
	let camera = renderer.getActiveCamera();
	// 获取当前焦点、焦距
	let focalP = camera.getFocalPoint();
	if (!keepFocalDis) {
		focalDis = camera.getDistance();
	}

	if (fineTuneMode.value !== "normal") {
		let transMat = userMatrixList.mat2[base];
		transMat = multiplyMatrix4x4(
			transMat,
			userMatrixList.mat4[
				// base.startsWith("U") ? "upper" : "lower"
				toRaw(loadedBracketNameList.upper).includes(base) ? "upper" : "lower"
			]
		);
		focalP = getTransformCoord([...focalP], transMat, "coord");
		viewUp = getTransformCoord([...viewUp], transMat, "normal");
		viewFront = getTransformCoord([...viewFront], transMat, "normal");
		viewLeft = getTransformCoord([...viewLeft], transMat, "normal");
		viewRight = getTransformCoord([...viewRight], transMat, "normal");
	}

	// 设置镜头[上]方向
	camera.setViewUp(viewUp);
	// 设置镜头位置
	let finalPos;
	switch (orientationType) {
		case "FRONT":
			finalPos = calculateByScale(focalP, viewFront, focalDis);
			break;
		case "LEFT":
			finalPos = calculateByScale(focalP, viewLeft, focalDis);
			break;
		case "RIGHT":
			finalPos = calculateByScale(focalP, viewRight, focalDis);
			break;
	}
	camera.setPosition(...finalPos);

	orientationWidget.updateMarkerOrientation();

	// render the scene
	renderWindow.render();
}

/**
 * @param originP - 原点
 * @param direction - 单位方向向量
 * @param distance - 距离
 * @returns 返回终点
 */
function calculateByScale(originP, direction, distance) {
	return [
		originP[0] + direction[0] * distance,
		originP[1] + direction[1] * distance,
		originP[2] + direction[2] * distance,
	];
}

/**
 * @description 获得某个法向量/坐标点经matrix变换后的点
 * @param pointCoord 法向量, eg.[0,0,1]
 * @param matrix 转换矩阵
 * @param type 'normal'|'coord'
 */
function getTransformCoord(pointCoord, matrix, type = "normal") {
	if (type === "normal") {
		let normalPoints = [0, 0, 0, pointCoord[0], pointCoord[1], pointCoord[2]];
		vtkMatrixBuilder
			.buildFromDegree()
			.setMatrix(matrix)
			.apply(normalPoints);
		return [
			normalPoints[3] - normalPoints[0],
			normalPoints[4] - normalPoints[1],
			normalPoints[5] - normalPoints[2],
		];
	}
	vtkMatrixBuilder
		.buildFromDegree()
		.setMatrix(matrix)
		.apply(pointCoord);
	return pointCoord;
}

/**
 * @description 选中某个托槽时调用, 镜头对准该托槽
 */
function focusOnSelectedBracket() {
	const { renderWindow, renderer, orientationWidget } = vtkContext;

	// 托槽初始读入的各项配置(所有托槽统一)
	let { name } = currentSelectBracket;
	let curTeethType = toRaw(loadedBracketNameList.upper).includes(name) ? "upper" : "lower";
	let focalPoint = [0, 0, 0]; // 镜头中心对准托槽中心
	let viewUp = [curTeethType === "upper" ? -1 : 1, 0, 0]; // 镜头向上打的角度向量
	let zNormal = [0, 1, 0]; // 镜头向前指的向量, 后续用于计算镜头位置(完整显示托槽)

	// 读取当前选中托槽actor的UserMatrix
	let { actor } = allActorList[curTeethType].bracket.filter(({ name: bracketName }) => bracketName === name)[0];
	// 变换各项数据
	vtkMatrixBuilder
		.buildFromDegree()
		.setMatrix(actor.getUserMatrix())
		.apply(focalPoint)
		.apply(viewUp)
		.apply(zNormal);
	// 注意其中normal相对于center而言
	subtract(viewUp, focalPoint, viewUp);
	subtract(zNormal, focalPoint, zNormal);

	// 获取当前镜头
	let camera = renderer.getActiveCamera();

	// 设置当前镜头角度,使选择托槽垂直于屏幕(yNormal-上下)
	// 使镜头[上]方向与yNormal托槽沿上下法向量 平齐
	camera.setViewUp(viewUp);

	// 设置镜头焦点为托槽中心点,使托槽居中屏幕(actor绕焦点旋转)
	camera.setFocalPoint(...focalPoint);

	// 定义镜头距离屏幕(物体近大远小)
	let focalDistance = 35;
	// 计算在当前镜头焦点和方向下的镜头位置(得到选中牙齿托槽正对屏幕的位置)
	// 托槽与镜头焦点在中心,沿zNormal(前后)移动ficalDistance距离(越小目标越近(越大))
	let finalPos = calculateByScale(focalPoint, zNormal, focalDistance);
	// 设置镜头位置(由于焦点固定,所以无法呈现在屏幕中间)
	camera.setPosition(...finalPos);
	// 相机可显示距离
	camera.setClippingRange(1, 1000);

	if (orientationWidget) {
		orientationWidget.updateMarkerOrientation();
	}

	// 渲染
	renderWindow.render();
}

/**
* @description: 牙齿贴合式托槽微调。
fineTuneRecordRotate保存着转矩操作引起的变换
fineTuneRecord保存着除转矩操作外（平移和z轴旋转）操作引起的变换
排牙时使用fineTuneRecord即可
* @param {*} moveOption
* @return {*}
* @author: ZhuYichen
*/
function fineTuneBracket(moveOption) {
	let { moveStep, moveType } = moveOption;
	let { renderer, renderWindow } = vtkContext;
	const isRotate = moveType=='XALONG'||moveType=='XANTI';

	const matchData = findSelectedBracketData();
	const { name } = currentSelectBracket;
	if(isRotate){
		rotateMessageList[name[2]-1].forEach((targetTooth)=>{
			if(name==targetTooth.name){
				// 牙尖外凸为正
				let plus = moveType=='XALONG'? -moveStep:moveStep;
				targetTooth.plus = targetTooth.plus+plus;
			}
		})
	}
	const {
		bottomFaceIndexList,
		bracketBottomPointValues,
	} = matchData;

	let {
		isCrossTheBorder,
		transActorMatrix: { transCenter, transXNormal, transYNormal, transZNormal },
	} = updateBracketDataByLandMark(
		bottomFaceIndexList,
		bracketBottomPointValues,
		toothPolyDatas[name].getPoints().getData(),
		bracketPolyDatas[name].getPoints().getData(),
		bracketPolyDatas[name].getPolys().getData(),
		isRotate?matchData.fineTuneRecordRotate.actorMatrix:matchData.fineTuneRecord.actorMatrix, 
		moveType,
		moveStep
	);
	if (isCrossTheBorder) {
		proxy.$message({
			message: "操作失败，托槽位置脱离牙齿！",
			type: "warning",
			center: true,
		});
	}
	if(isRotate){
		matchData.fineTuneRecordRotate = {
			actorMatrix: {
				// 决定托槽本身角度的法向量方向(角度定位轴)
				center: [...transCenter],
				xNormal: [...transXNormal],
				yNormal: [...transYNormal],
				zNormal: [...transZNormal],
			},
		};
	}else{
		matchData.fineTuneRecord = {
			actorMatrix: {
				// 决定托槽本身角度的法向量方向(角度定位轴)
				center: [...transCenter],
				xNormal: [...transXNormal],
				yNormal: [...transYNormal],
				zNormal: [...transZNormal],
			},
		};
	}
	// 托槽变换
	updateAndApplySingleBracketUserMatrix(
		name, 
		isRotate?matchData.fineTuneRecordRotate.actorMatrix:matchData.fineTuneRecord.actorMatrix, 
		fineTuneMode.value, 
		isRotate
	);

	renderWindow.render();
	// 子窗口跟着变
	vtkSegToothContext.renderWindow.render();

	// 重新计算距离 + 更新距离文字
	updateDistanceLineActor(name, transCenter, transZNormal, transXNormal, renderer, renderWindow);
}
const teethArrange = store.state.actorHandleState.teethArrange;
function uploadDataOnline(uploadStateMessage, submit = false) {
	/**
	 * data: 全cado
	 * stl = data.stl
	 * xml = data.xml
	 * result = xml2js.parseStringPromise(xml)
	 * xmlObj[teethType] = result.CADOProject
	 * xmlData = xmlObj[teethType].PositionResult[0].Position
	 * center->xmlData.TcPosition[0].TcCenterCoor[0].$ .Coor0 .Coor1 .Coor2
	 * yNormal->xmlData.TcPosition[0].TcCenterAxis[0].$ .Coor0 .Coor1 .Coor2
	 * zNormal->xmlData.TcPosition[0].TcNormal[0].$ .Coor0 .Coor1 .Coor2
	 */
	const modelType = {
		upper: "UpperConfig",
		lower: "LowerConfig",
	};
	store.dispatch("userHandleState/updateUploadingProgress", {
		teethType: "upper",
		value: 0,
	});
	store.dispatch("userHandleState/updateUploadingProgress", {
		teethType: "lower",
		value: 0,
	});
	let teethArrangeData = toRaw(teethArrange);
	uploadType.value.forEach((teethType) => {
		store.dispatch("userHandleState/updateUploadingState", {
			teethType,
			value: true,
		});
		let postFormData = new FormData();
		postFormData.append("userId", store.state.userHandleState.userId);
		// postFormData.append('patientUid', '{' + patientUID.value + '}')
		postFormData.append("patientUid", patientUID.value);
		postFormData.append("modelType", modelType[teethType]);
		postFormData.append("ModelStateChange", submit ? "1" : "0");
		postFormData.append("Remarks", "");
		const uploadConfig = {
			onUploadProgress: (e) => {
				store.dispatch("userHandleState/updateUploadingProgress", {
					teethType,
					value: Math.ceil((e.loaded / e.total) * 100),
				});
			},
		};
		let { arrangeMatrix, dentalArchSettings, teethStandardAxis, dentalArchAdjustRecord } = teethArrangeData;
		// let filterWord = teethType === "upper" ? "U" : "L";
		let dataToMount = {
			rotatePlusData: rotateMessageList,
			bracketData: bracketData[teethType].map((item) => {
				const {
					name,
					fineTuneRecord: {
						actorMatrix: { center, yNormal, zNormal },
					},
				} = item;
				return {
					name,
					center,
					yNormal,
					zNormal,
				};
			}),
			bracketDataRotate: bracketData[teethType].map((item) => {
				const {
					name,
					fineTuneRecordRotate: {
						actorMatrix: { center, yNormal, zNormal },
					},
				} = item;
				return {
					name,
					center,
					yNormal,
					zNormal,
				};
			}),
			longAxisData: allActorList[teethType].distanceLine.map((item) => {
				const { name, startPointRep, endPointRep } = item;
				return {
					name,
					startCoor: startPointRep.getSphere().getCenter(),
					endCoor: endPointRep.getSphere().getCenter(),
				};
			}),
			teethArrangeData: {
				arrangeMatrix: Object.fromEntries(
					Object.entries(arrangeMatrix).filter((item) =>
						// item[0].startsWith(filterWord)
						toRaw(loadedBracketNameList[teethType]).includes(item[0])
					)
				),
				dentalArchSettings: dentalArchSettings[teethType],
				teethStandardAxis: teethStandardAxis[teethType],
			},
			teethAxisFinetuneRecord: teethAxisFinetuneRecord[teethType], // 初始的牙齿坐标系 + 后续的咬合调整构成最终矩阵
			dentalArchAdjustRecord: dentalArchAdjustRecord[teethType].resetCenters,
		};
		uploadCurrentData(
			toRaw(stlObj.teeth[teethType]),
			toRaw(xmlObj[teethType]),
			dataToMount,
			window.linkConfig.saveDataApi,
			postFormData,
			uploadConfig
		).then(
			() => {
				uploadStateMessage[teethType].success(); // 显示成功信息弹窗
				overwriteFineTuneRecord(); // 覆盖微调记录
				store.dispatch("userHandleState/updateUploadingProgress", {
					teethType: "upper",
					value: 0,
				});
				store.dispatch("userHandleState/updateUploadingProgress", {
					teethType: "lower",
					value: 0,
				});
				store.dispatch("userHandleState/updateSetDataCheckableFlag", {
					teethType: teethType,
					value: true,
				});
				if (submit) {
					// 成功保存后进行数据递交
					checkDataOnline();
				} else {
					// 不递交则直接关毕对话框
					store.dispatch("userHandleState/updateUploadingState", {
						teethType,
						value: false,
					});
				}
			},
			() => {
				uploadStateMessage[teethType].failed(); // 显示失败信息弹窗
				store.dispatch("userHandleState/updateUploadingProgress", {
					teethType: "upper",
					value: 0,
				});
				store.dispatch("userHandleState/updateUploadingProgress", {
					teethType: "lower",
					value: 0,
				});
				store.dispatch("userHandleState/updateUploadingState", {
					teethType,
					value: false,
				});
			}
		);
	});
}

let hasRotateInfo = ref(false);
const showRotateButton = inject('showRotateButton')
/**
 * @description: 监视转矩列表是否变化，如果转矩列表中写入了rotate数据，说明当前托槽带有转矩信息
 * @return {*}
 * @author: ZhuYichen
 */
watch(rotateMessageList,(newVal)=>{
	if(newVal[0][0].rotate){
		hasRotateInfo.value=true;
		showRotateButton();
	}
})

function checkDataOnline() {
	const modelType = {
		upper: "UpperConfig",
		lower: "LowerConfig",
	};
	store.dispatch("userHandleState/updateUploadingProgress", {
		teethType: "upper",
		value: 0,
	});
	store.dispatch("userHandleState/updateUploadingProgress", {
		teethType: "lower",
		value: 0,
	});
	uploadType.value.forEach((teethType) => {
		store.dispatch("userHandleState/updateUploadingState", {
			teethType,
			value: true,
		});
		sendRequestWithToken({
			method: "POST",
			url: window.linkConfig.checkDataApi,
			data: {
				patientUid: patientUID.value,
				modelType: modelType[teethType],
			},
		}).then(
			(res) => {
				if (res.data.data) {
					proxy.$message({
						message: `确认${teethType === "upper" ? "上颌" : "下颌"}方案成功！`,
						type: "success",
					});
					store.dispatch("userHandleState/updateDataCheckedState", {
						teethType,
						value: true,
					});
				} else {
					proxy.$message({
						message: `确认${teethType === "upper" ? "上颌" : "下颌"}方案失败！`,
						type: "error",
					});
				}
				store.dispatch("userHandleState/updateUploadingState", {
					teethType,
					value: false,
				});
			},
			() => {
				proxy.$message({
					message: `确认${teethType === "upper" ? "上颌" : "下颌"}方案失败！`,
					type: "error",
				});
				store.dispatch("userHandleState/updateUploadingState", {
					teethType,
					value: false,
				});
			}
		);
	});
}
const setDataCheckableFlag = computed(() => store.state.userHandleState.setDataCheckableFlag);

// 保存，需要发送upload
watch(setDataCheckableFlag, (newVal)=>{
	if(newVal.upper&&newVal.lower){
		// 修改方案是否已确认的标志位
		setDataCheckable()
		// 通知后台发送方案上传请求
		sendPostRequest('upload')
		store.dispatch("userHandleState/updateSetDataCheckableFlag", {
			teethType: 'upper',
			value: false,
		});
		store.dispatch("userHandleState/updateSetDataCheckableFlag", {
			teethType: 'lower',
			value: false,
		});
	}
}, { deep: true })

const isDataChecked = computed(() => store.state.userHandleState.isDataChecked);


watch(isDataChecked, (newVal)=>{
	// 递交，需要发送audit(存在一个问题，如果数据已被递交然后刷新页面，也会触发这个监视)
	if(newVal.upper&&newVal.lower){
		sendPostRequest('audit')
	}
	// 撤回，需要发送audit
	if(!newVal.upper&&!newVal.lower){
		sendPostRequest('audit')
	}
}, { deep: true })
const isAnyDataCheckable = computed(() => store.getters["userHandleState/isAnyDataCheckable"]); 
const userId = computed(() => store.state.userHandleState.userId);
const orderId = computed(() => store.state.userHandleState.orderId);
const patientBelongUserId = computed(() => store.state.userHandleState.patientBelongUserId);

/**
 * @description: 2023.9.7更新：给管理员用户提供的功能，表明方案是不是已经确认完成。
 * @return {*}
 * @author: ZhuYichen
 */
function setDataCheckable(){
	const modelType = {
		upper: "UpperConfig",
		lower: "LowerConfig",
	};
	const flag = isAnyDataCheckable.value
	uploadType.value.forEach((teethType) => {
		sendRequestWithToken({
			method: "POST",
			url: window.linkConfig.checkDataApi,
			data: {
				patientUid: patientUID.value,
				modelType: modelType[teethType],
				isUserCheckable: flag?"1":"0",
			},
		}).then(
			(res) => {

			},
			() => {

			}
		);
	});
	// 2023.11.13更新：如果方案已确认，还需要给舒雅发个通知；
	// 该功能目前只对ID为VIPMMM001的用户有效
	// if(patientBelongUserId.value == 'vipmmm001'){
	// 	if(flag){
	// 		sendRequestWithToken({
	// 			method: "POST",
	// 			url: window.linkConfig.suyaUploadDesignApi,
	// 			data: {
	// 				patientId: patientUID.value,
	// 				orderId: orderId.value,
	// 			},
	// 		}).then(
	// 			(res) => {
	// 				console.log(res)
	// 			},
	// 			(error) => {
	// 				console.log(error)
	// 			}
	// 		);
	// 	}
	// }
}

/**
 * @description: 通知后端发送方案上传/医生方案审核请求
 * @param {*} requestType 如果是upload，则说明点击的是保存，后端发送方案上传请求；如果是audit，则说明点击递交，后端发送医生方案审核通知请求
 * @return {*}
 * @author: ZhuYichen
 */
function sendPostRequest(requestType){
	sendRequestWithToken({
			method: "POST",
			url: window.linkConfig.sendPostRequestApi,
			data: {
				patientUid: patientUID.value,
				requestType: requestType,
			},
		}).then(
			(res) => {
				console.log(res)
			},
			(error) => {
				console.log(error)
			}
		);
}

/**
 * @description: 递交时，需要调舒雅的api，发送医生方案审核通知
 * @return {*}
 * @author: ZhuYichen
 */
function suyaDoctorAudit(){
	const flag = isAnyDataCheckable.value
	if(patientBelongUserId.value == 'vipmmm001'){
		sendRequestWithToken({
			method: "POST",
			url: window.linkConfig.suyaDoctorAuditApi,
			data: {
				patientId: patientUID.value,
				auditStatus: flag,
			},
		}).then(
			(res) => {
				console.log(res)
			},
			(error) => {
				console.log(error)
			}
		);
	}
}
/**
 * @description 在提交数据后, 用当前微调位置覆盖原始微调位置
 */
function overwriteFineTuneRecord() {
	// 在提交数据后, 覆盖bracketData中的position为当前微调的位置
	for (let teethType of ["upper", "lower"]) {
		bracketData[teethType].forEach((item) => {
			const {
				fineTuneRecord: {
					actorMatrix: { center, xNormal, yNormal, zNormal },
				},
			} = item;
			item.position = {
				center: [...center],
				xNormal: [...xNormal],
				yNormal: [...yNormal],
				zNormal: [...zNormal],
			};
		});
	}
	// 如果未进入过排牙, mat1为(0,0,0)->position, mat3为position->当前微调位置finetuneRecord,
	// 此时reset, mat1为(0,0,0)->position, mat3(重新计算)为position->position
	// 如果进入过排牙, mat1为(0,0,0)->排牙前一刻位置, mat3为排牙前一刻->当前微调位置finetuneRecord
	// 此时reset, mat1为(0,0,0)->排牙前一刻位置, mat3(重新计算)为排牙前一刻->position

	// 保存后用当前微调位置finetuneRecord覆盖初始位置position,
	// 如果未进入过排牙,
	// 此时reset, mat1为(0,0,0)->(覆盖前)position, mat3(重新计算)为(覆盖后)position->(覆盖后)position
	// >> reset不成立, 需要更新mat1为(0,0,0)->(覆盖后)position, 设置mat3, invMat3为单位阵, 以确保reset成立
	// 如果进入过排牙,
	// 此时reset, mat1为(0,0,0)->排牙前一刻位置, mat3(重新计算)为排牙前一刻->(覆盖后)possition
	// reset成立, 不需要更改
	if (Object.keys(preFineTuneRecord.upper).length === 0 && Object.keys(preFineTuneRecord.lower).length === 0) {
		// 更新mat1为(0,0,0)->(覆盖后)position, 设置mat3, invMat3为单位阵
		for (let teethType of ["upper", "lower"]) {
			bracketData[teethType].forEach((item) => {
				const {
					name,
					position: { center, xNormal, yNormal, zNormal },
				} = item;
				userMatrixList.mat1[name] = calculateRigidBodyTransMatrix(center, xNormal, yNormal, zNormal); // 原点->托槽排牙前旧位置
				userMatrixList.mat3[name] = userMatrixList.identity[name];
				userMatrixList.invMat3[name] = userMatrixList.identity[name];
			});
		}
	}
}
function rollbackCheckedData() {
	const modelType = {
		upper: "UpperConfig",
		lower: "LowerConfig",
	};
	for (let teethType of store.getters["userHandleState/teethTypeToRollBack"]) {
		sendRequestWithToken({
			method: "POST",
			url: window.linkConfig.rollbackDataApi,
			data: {
				patientUid: patientUID.value,
				modelType: modelType[teethType],
			},
		}).then(
			(res) => {
				if (res.data.data) {
					if (res.data.data.includes("Success")) {
						proxy.$message({
							message: `撤回${teethType === "upper" ? "上颌" : "下颌"}方案成功！`,
							type: "success",
						});
						// successCallback();
						store.dispatch("userHandleState/updateDataCheckedState", {
							teethType,
							value: false,
						});
					} else {
						if (res.data.data.includes("Exceed Authority")) {
							proxy.$message({
								message: `无权限撤回${teethType === "upper" ? "上颌" : "下颌"}方案！`,
								type: "error",
							});
						} else {
							proxy.$message({
								message: `撤回${teethType === "upper" ? "上颌" : "下颌"}方案失败！`,
								type: "error",
							});
						}
						// failedCallback();
					}
				} else {
					proxy.$message({
						message: `撤回${teethType === "upper" ? "上颌" : "下颌"}方案失败！`,
						type: "error",
					});
					// failedCallback();
				}
			},
			() => {
				proxy.$message({
					message: `撤回${teethType === "upper" ? "上颌" : "下颌"}方案失败！`,
					type: "error",
				});
				// failedCallback();
			}
		);
	}
}

/**
 * @description 在[通常模式]/[模拟排牙-托槽固定]/[模拟排牙-牙齿固定]中切换
 * 对 托槽,牙齿,坐标轴,距离线,距离文字,轴点反映射,牙弓线 setUserMatrix
 * 具体见 updateApplyUserMatrixWhenSwitchMode() 的函数说明
 * @param fromMode normal | simBracketFix | simToothFix
 * @param toMode normal | simBracketFix | simToothFix
 * @param render 是否渲染
 */
function applyUserMatrixWhenSwitchMode(fromMode, toMode, render = false) {
	updateApplyUserMatrixWhenSwitchMode(fromMode, toMode, toRaw(loadedBracketNameList));
	// 变换actor矩阵
	for (let teethType of ["upper", "lower"]) {
		const { tooth, bracket, toothAxis, distanceLine, arch, rootGenerate } = allActorList[teethType];
		// 牙齿
		tooth.forEach((item) => {
			const { name, actor } = item;
			actor.setUserMatrix(applyCalMatrix.tad[name]);
		});
		// 牙根
		rootGenerate.forEach((item) => {
			const { name, actor } = item;
			actor.setUserMatrix(applyCalMatrix.tad[name]);
		});
		// 托槽
		bracket.forEach((item) => {
			const { name, actor } = item;
			actor.setUserMatrix(applyCalMatrix.bracket[name]);
		});
		// 坐标轴
		toothAxis.forEach((item) => {
			const { name, actors } = item;
			actors.forEach((actor) => {
				actor.setUserMatrix(applyCalMatrix.tad[name]);
			});
		});
		distanceLine.forEach((item) => {
			const {
				name,
				lineActorItem: { lineActor, planeActor, psMapper },
				startPointRep,
				endPointRep,
			} = item;
			// 距离线
			lineActor.setUserMatrix(applyCalMatrix.tad[name]);
			// 垂面
			planeActor.setUserMatrix(applyCalMatrix.tad[name]);
			// 距离文字
			psMapper.setMatrix2(applyCalMatrix.tad[name]);
			// 轴点反映射
			// startPointRep.setInvMatrix2(applyCalMatrix.sphereReversrProj[name]); // 设置其中的invMatrix2矩阵
			// endPointRep.setInvMatrix2(applyCalMatrix.sphereReversrProj[name]);
			// 依赖点集
			startPointRep.getActor().setUserMatrix(applyCalMatrix.tad[name]);
			endPointRep.getActor().setUserMatrix(applyCalMatrix.tad[name]);
		});
		// 牙弓线
		if (arch.actor) {
			arch.actor.setUserMatrix(applyCalMatrix.arch[teethType]);
		}
	}
	if (render) {
		vtkContext.renderWindow.render();
		// 由于共享actor, 只要牙齿矩阵变换子窗口就会受到共同影响, 此处通过重置视角来抵消矩阵变换的影响
		segToothWindowFlush();
	}
}

/**
 * @description 在托槽微调/重置时调用的函数, 用于更新mat3并重新设置相关userMatrix
 * 该函数不会切换状态, 根据applyUserMatrixWhenSwitchMode的表格
 * 只针对某颗牙齿相关的actor中和mat3相关的矩阵
 * @param bracketName 托槽名称
 * @param newFineTuneRecord 新的微调位置
 * @param currMode 当前模式
 */
function updateAndApplySingleBracketUserMatrix(bracketName, newFineTuneRecord, currMode, isRotate=false) {
	// ---寻找这颗牙齿相关的所有actor(根据表格, 托槽微调不可能影响牙弓线, 不予考虑)---
	const matchItem = {
		teethType: "upper",
		tooth: [],
		rootGenerate: [],
		bracket: [],
		toothAxis: [],
		distanceLine: [],
	};
	for (let typeKey of ["tooth", "bracket", "toothAxis", "distanceLine", "rootGenerate"]) {
		for (let teethType of ["upper", "lower"]) {
			const filteredItem = allActorList[teethType][typeKey].filter((item) => item.name === bracketName);
			if (filteredItem.length > 0) {
				matchItem[typeKey] = filteredItem[0]; // 必定只能找出1个
				matchItem.teethType = teethType;
			}
		}
	}

	// ---更新mat3和invMat3---
	// 读取pre微调记录(上次排牙牙弓线拟合的托槽位置)
	let preBracketPosition = null;
	for (let teethType of ["upper", "lower"]) {
		if (Object.keys(preFineTuneRecord[teethType]).includes(bracketName)) {
			preBracketPosition = preFineTuneRecord[teethType][bracketName];
		}
	}
	// 如果没有pre记录, 即未进入过模拟排牙, 则将pre位置设置为托槽position(托槽加载进去的初始位置)
	// 如果是转矩操作，那么操作参考的初始位置永远都是一开始托槽的初始位置，与所有的平移和排牙无关
	if (!preBracketPosition||isRotate) {
		for (let teethType of ["upper", "lower"]) {
			bracketData[teethType].forEach((item) => {
				const { name, position } = item;
				if (bracketName === name) {
					preBracketPosition = position;
				}
			});
		}
	}

	const needToUpdate = updateSingleBracketUserMatrix(
		bracketName,
		matchItem.teethType,
		preBracketPosition,
		newFineTuneRecord,
		currMode,
		isRotate,
	);
	// 转换数据
	// -设置
	if (needToUpdate.tad) {
		// 牙齿
		matchItem.tooth.actor.setUserMatrix(applyCalMatrix.tad[bracketName]);
		// 牙根
		if(matchItem.rootGenerate.actor){
			matchItem.rootGenerate.actor.setUserMatrix(applyCalMatrix.tad[bracketName]);
		}
		// 坐标轴
		matchItem.toothAxis.actors.forEach((actor) => {
			actor.setUserMatrix(applyCalMatrix.tad[bracketName]);
		});
		// 距离线
		matchItem.distanceLine.lineActorItem.lineActor.setUserMatrix(applyCalMatrix.tad[bracketName]);
		// 垂面
		matchItem.distanceLine.lineActorItem.planeActor.setUserMatrix(applyCalMatrix.tad[bracketName]);
		// 距离文字
		matchItem.distanceLine.lineActorItem.psMapper.setMatrix2(applyCalMatrix.tad[bracketName]);
	}
	if (needToUpdate.bracket) {
		// 托槽
		matchItem.bracket.actor.setUserMatrix(applyCalMatrix.bracket[bracketName]);
	}
	if (needToUpdate.sphereReversrProj) {
		// 轴点反映射
		matchItem.distanceLine.startPointRep.setInvMatrix2(applyCalMatrix.sphereReversrProj[bracketName]);
		matchItem.distanceLine.endPointRep.setInvMatrix2(applyCalMatrix.sphereReversrProj[bracketName]);
	}
	if (needToUpdate.dependingTrans) {
		// 依赖点集
		matchItem.distanceLine.startPointRep.getActor().setUserMatrix(applyCalMatrix.tad[bracketName]);
		matchItem.distanceLine.endPointRep.getActor().setUserMatrix(applyCalMatrix.tad[bracketName]);
	}
	// -渲染
	vtkContext.renderWindow.render();
}

/**
 * @description 在首次排牙牙齿坐标系actor生成后调用, 用于初始化mat5, 并设置userMatrix
 * 其中mat5仅在此次计算之后便维持不变, 因为牙齿标准坐标系根据牙齿读入数据生成, 不可能再变化
 */
function initMatrixWhenTeethAxisSphereGenerated() {
	// 此处初始化特别注意, 如果有咬合关系保存在服务器上, 则直接使用
	// 没有则使用标准坐标系
	initMatrixForTeethAxisSphere(arrangeTeethType.value, toRaw(teethStandardAxis));
	for (let teethType of arrangeTeethType.value) {
		// 仅更新坐标系, 其余actor不需要更新, 因为mat4不变
		allActorList[teethType].teethAxisSphere.actor.setUserMatrix(applyCalMatrix.teethAxisSphere[teethType]);
	}
}

let tempSaveData = {}
/**
 * @description 在牙齿咬合位置调整时调用, 用于更新mat4并重新设置相关userMatrix
 * 根据坐标轴和移动方向+移动距离计算新的center
 * 注意牙齿标准坐标系是根据牙齿数据中的长轴数据生成的, 该数据不会随托槽微调或者排牙变化, 因此mat4的更新和其它矩阵的更新相互独立
 */
function fineTuneTeethPosition({ moveType, moveStep, teethType }) {
	switch (moveType) {
		case "OPEN_PANEL": {
			// 打开面板时开启子线程
			teethBiteworker = new TeethBiteWorker();
			// 返回数据接收函数
			teethBiteworker.onmessage = function(event) {
				const {
					data: { biteType, teethType, centerTranslate },
				} = event;
				const { center } = teethAxisFinetuneRecord[teethType];
				switch (biteType) {
					case "autoBiteZ": {
						if (centerTranslate === null) {
							proxy.$message({
								message: `当前位置的上下颌牙无法咬合！`,
								type: "warning",
							});
							releaseTeethPositionAdjustMoveType();
							return;
						}
						add(center, [0, 0, teethType === "upper" ? -centerTranslate : centerTranslate], center);
						updateMat4(teethType);
						releaseTeethPositionAdjustMoveType();
						break;
					}
					case "autoBiteY": {
						// 返回数据接收
						if (centerTranslate === null) {
							proxy.$message({
								message: `当前位置的上下颌牙无法咬合！`,
								type: "warning",
							});
							releaseTeethPositionAdjustMoveType();
							return;
						}
						add(center, [0, teethType === "upper" ? -centerTranslate : centerTranslate, 0], center);
						updateMat4(teethType);
						releaseTeethPositionAdjustMoveType();
						break;
					}
				}
			};
			return;
		}
		case "EXIT_PANEL": {
			// 退出面板时销毁子线程
			teethBiteworker.terminate();
			releaseTeethPositionAdjustMoveType();
			return;
		}
		case "ZBITE": {
			const toothPointsDatas = {}; // 上下都要
			const toothFacesDatas = {}; // 只要上
			for (let toothName in toothPolyDatas) {
				toothPointsDatas[toothName] = toothPolyDatas[toothName].getPoints().getData();
				if (toRaw(loadedBracketNameList.upper).includes(toothName)) {
					toothFacesDatas[toothName] = toothPolyDatas[toothName].getPolys().getData();
				}
			}
			teethBiteworker.postMessage({
				biteType: "autoBiteZ",
				teethType,
				toothPointsDatas,
				toothFacesDatas,
				transMatrix: applyCalMatrix.tad,
			});
			return;
		}
		case "YBITE": {
			const toothPointsDatas = {}; // 上下都要
			const toothFacesDatas = {}; // 只要上
			for (let toothName in toothPolyDatas) {
				toothPointsDatas[toothName] = toothPolyDatas[toothName].getPoints().getData();
				if (toRaw(loadedBracketNameList.upper).includes(toothName)) {
					toothFacesDatas[toothName] = toothPolyDatas[toothName].getPolys().getData();
				}
			}
			teethBiteworker.postMessage({
				biteType: "autoBiteY",
				teethType,
				toothPointsDatas,
				toothFacesDatas,
				transMatrix: applyCalMatrix.tad,
			});
			return;
		}
	}
	// 根据牙齿标准坐标系进行6个方向的移动或旋转
	const { xNormal: xNormalStandard, yNormal: yNormalStandard, zNormal: zNormalStandard } = toRaw(teethStandardAxis)[
		teethType
	];
	// zNormal指向牙尖, yNormal指向门牙, xNormal从L->R
	const {
		center: centerBiteRecord,
		xNormal: xNormalBiteRecord,
		yNormal: yNormalBiteRecord,
		zNormal: zNormalBiteRecord,
	} = toRaw(resetTeethAxisFinetuneRecord)[teethType];

	const { center, xNormal, yNormal, zNormal } = teethAxisFinetuneRecord[teethType];
	// 计算变换后的结果, 更新到teethAxisFinetuneRecord
	switch (moveType) {
		case "TEMPSAVE": {
			// 深拷贝
			tempSaveData = JSON.parse(JSON.stringify({ center, xNormal, yNormal, zNormal }))
			break;
		}
		case "TEMPRESET": {
			if (tempSaveData.center){
				center[0] = tempSaveData.center[0]
				center[1] = tempSaveData.center[1]
				center[2] = tempSaveData.center[2]
				xNormal[0] = tempSaveData.xNormal[0]
				xNormal[1] = tempSaveData.xNormal[1]
				xNormal[2] = tempSaveData.xNormal[2]
				yNormal[0] = tempSaveData.yNormal[0]
				yNormal[1] = tempSaveData.yNormal[1]
				yNormal[2] = tempSaveData.yNormal[2]
				zNormal[0] = tempSaveData.zNormal[0]
				zNormal[1] = tempSaveData.zNormal[1]
				zNormal[2] = tempSaveData.zNormal[2]
			}
			break;
		}
		case "RESET": {
			teethAxisFinetuneRecord[teethType] = {
				...teethAxisFinetuneRecord[teethType],
				center: [...centerBiteRecord],
				xNormal: [...xNormalBiteRecord],
				yNormal: [...yNormalBiteRecord],
				zNormal: [...zNormalBiteRecord],
			};
			break;
		}
		case "UP": {
			const posOffset = [...zNormalStandard];
			multiplyScalar(posOffset, teethType === "upper" ? -moveStep : moveStep);
			add(center, posOffset, center);
			break;
		}
		case "DOWN": {
			const posOffset = [...zNormalStandard];
			multiplyScalar(posOffset, -1);
			multiplyScalar(posOffset, teethType === "upper" ? -moveStep : moveStep);
			add(center, posOffset, center);
			break;
		}
		case "RIGHT": {
			const posOffset = [...xNormalStandard];
			multiplyScalar(posOffset, -1);
			multiplyScalar(posOffset, moveStep);
			add(center, posOffset, center);
			break;
		}
		case "LEFT": {
			const posOffset = [...xNormalStandard];
			multiplyScalar(posOffset, moveStep);
			add(center, posOffset, center);
			break;
		}
		case "INWARD": {
			const posOffset = [...yNormalStandard];
			multiplyScalar(posOffset, -1);
			multiplyScalar(posOffset, moveStep);
			add(center, posOffset, center);
			break;
		}
		case "OUTWARD": {
			const posOffset = [...yNormalStandard];
			multiplyScalar(posOffset, moveStep);
			add(center, posOffset, center);
			break;
		}
		case "XALONG": {
			vtkMatrixBuilder
				.buildFromDegree()
				.rotate(moveStep, xNormal)
				.apply(yNormal)
				.apply(zNormal);
			break;
		}
		case "XANTI": {
			vtkMatrixBuilder
				.buildFromDegree()
				.rotate(-moveStep, xNormal)
				.apply(yNormal)
				.apply(zNormal);
			break;
		}
		case "YALONG": {
			vtkMatrixBuilder
				.buildFromDegree()
				.rotate(moveStep, yNormal)
				.apply(xNormal)
				.apply(zNormal);
			break;
		}
		case "YANTI": {
			vtkMatrixBuilder
				.buildFromDegree()
				.rotate(-moveStep, yNormal)
				.apply(xNormal)
				.apply(zNormal);
			break;
		}
		case "ZALONG": {
			vtkMatrixBuilder
				.buildFromDegree()
				.rotate(moveStep, zNormal)
				.apply(xNormal)
				.apply(yNormal);
			break;
		}
		case "ZANTI": {
			vtkMatrixBuilder
				.buildFromDegree()
				.rotate(-moveStep, zNormal)
				.apply(xNormal)
				.apply(yNormal);
			break;
		}
	}
	updateMat4(teethType);
	updateDentalArchWidgetRecordAfterMatrixUpdate();
	releaseTeethPositionAdjustMoveType();
}
// 计算新的变换矩阵mat4
function updateMat4(teethType) {
	updateMatrixWhenFineTuneTeethPosition(
		teethType,
		toRaw(teethStandardAxis),
		toRaw(loadedBracketNameList[teethType]),
		fineTuneMode.value
	);

	// 设置setUserMatrix
	const { tooth, bracket, toothAxis, distanceLine, arch, teethAxisSphere, rootGenerate } = allActorList[teethType];
	// 牙齿
	tooth.forEach((item) => {
		const { name, actor } = item;
		actor.setUserMatrix(applyCalMatrix.tad[name]);
	});
	// 牙根
	rootGenerate.forEach((item) => {
		const { name, actor } = item;
		actor.setUserMatrix(applyCalMatrix.tad[name]);
	});
	// 托槽
	bracket.forEach((item) => {
		const { name, actor } = item;
		actor.setUserMatrix(applyCalMatrix.bracket[name]);
	});
	// 坐标轴
	toothAxis.forEach((item) => {
		const { name, actors } = item;
		actors.forEach((actor) => {
			actor.setUserMatrix(applyCalMatrix.tad[name]);
		});
	});
	distanceLine.forEach((item) => {
		const {
			name,
			lineActorItem: { lineActor, planeActor, psMapper },
			startPointRep,
			endPointRep,
		} = item;
		// 距离线
		lineActor.setUserMatrix(applyCalMatrix.tad[name]);
		// 垂面
		planeActor.setUserMatrix(applyCalMatrix.tad[name]);
		// 距离文字
		psMapper.setMatrix2(applyCalMatrix.tad[name]);
		// 轴点反映射
		startPointRep.setInvMatrix2(applyCalMatrix.sphereReversrProj[name]); // 设置其中的invMatrix2矩阵
		endPointRep.setInvMatrix2(applyCalMatrix.sphereReversrProj[name]);
		// 依赖点集
		startPointRep.getActor().setUserMatrix(applyCalMatrix.tad[name]);
		endPointRep.getActor().setUserMatrix(applyCalMatrix.tad[name]);
	});
	// 牙弓线
	if (arch.actor) {
		arch.actor.setUserMatrix(applyCalMatrix.arch[teethType]);
	}
	// 牙齿坐标系
	teethAxisSphere.actor.setUserMatrix(applyCalMatrix.teethAxisSphere[teethType]);
	// 渲染
	vtkContext.renderWindow.render();
	// 由于子窗口actor共享, 因此对于牙齿的userMatrix设置会影响到子窗口的牙齿, 这里最好的做法就是让它重新聚焦, 即重置子窗口
	segToothWindowFlush();

	// 相机可显示距离调整, 防止截断
	vtkContext.renderer.getActiveCamera().setClippingRange(1, 1000);
	vtkContext.renderWindow.render();
}

let enterAtInitTime = computed(() => store.state.actorHandleState.teethArrange.enterAtInitTime);
let isArrangeDataComplete = computed(() => store.getters["actorHandleState/isArrangeDataComplete"]);
// 进入模拟排牙
let clickEnter = false;
function openSimulationMode() {
	if (arrangeTeethType.value.length === 0 || (isArrangeDataComplete.value && !enterAtInitTime.value)) {
		// 不作任何排牙进入排牙模式, 条件:
		// 1、双颌数据均不满足排牙要求
		// 2、已经进行过排牙 + 不是首次进入
		adjustActorWhenSwitchSimMode("enter", true);
		applyUserMatrixWhenSwitchMode("normal", simMode.value, true);
	} else {
		// 开始排牙, 条件:
		// 1、必须满足排牙条件
		// 2、从零开始排牙 / 虽然已经有排牙数据但是本次为首次进入排牙模式
		// * 从零 -> 完整排牙
		// * 已有数据 -> 第一次还有牙弓线需要制造 -> 忽略步骤排牙
		clickEnter = true;
		forceUpdateArrange();
	}
}
/**
 * @description 切换至咬合面板, 咬合面板中切换上下颌时调用, 此时牙齿坐标系actor一定已经构建完毕
 */
function adjustTeethAxisSphereActorInScene(mode, curTeethType, preTeethType) {
	const addActorsList = [];
	const delActorsList = [];
	switch (mode) {
		case "enter": {
			addActorsList.push(allActorList[curTeethType].teethAxisSphere.actor);
			break;
		}
		case "exit": {
			delActorsList.push(allActorList[curTeethType].teethAxisSphere.actor);
			break;
		}
		case "switch": {
			addActorsList.push(allActorList[curTeethType].teethAxisSphere.actor);
			delActorsList.push(allActorList[preTeethType].teethAxisSphere.actor);
			break;
		}
	}
	actorInSceneAdjust(addActorsList, delActorsList);

	// 相机可显示距离调整, 防止截断
	vtkContext.renderer.getActiveCamera().setClippingRange(1, 1000);
	vtkContext.renderWindow.render();
}

// 仅用于首次进入[排牙]时, 不论是读取数据时自动进入, 还是手动点击[进入]按钮进入, 如果有咬合mat4则直接通过RESET应用
let firstTimeAdjustBite = true;
watch(currentArrangeStep, (newVal) => {
	if (newVal.upper === 6 && newVal.lower === 6) {
		store.dispatch("userHandleState/switchArrangeBarOpenState", false);
		// 初始化
		store.dispatch("userHandleState/updateArrangeProgress", {
			upper: {
				L: { finish: 0, total: 0 },
				R: { finish: 0, total: 0 },
			},
			lower: {
				L: { finish: 0, total: 0 },
				R: { finish: 0, total: 0 },
			},
		});
		// actor加入屏幕
		adjustActorWhenSwitchSimMode("enter", clickEnter);
		clickEnter=false;
		// 当前模式不是normal则在更新矩阵前先把所有数据转到normal(主要针对依赖点集,转换需要依赖旧矩阵)
		if (forceUpdateAtMode !== "normal") {
			applyUserMatrixWhenSwitchMode(forceUpdateAtMode, "normal", true);
		}
		updateMatrixAfterArrangeTeeth(
			arrangeTeethType.value,
			toRaw(loadedBracketNameList),
			toRaw(arrangeMatrixList.value),
			preFineTuneRecord
		);
		initMatrixWhenTeethAxisSphereGenerated();
		applyUserMatrixWhenSwitchMode("normal", simMode.value, true);

		// 重置咬合位置，此处主要想在初始化的时候就展示咬合关系
		// 但要注意如果咬合位置没有保存，则会在发生排牙/调整牙弓线时重置回去
		if (firstTimeAdjustBite) {
			firstTimeAdjustBite = false;
			for (let teethType of arrangeTeethType.value) {
				fineTuneTeethPosition({
					moveType: "RESET",
					teethType,
				});
			}
		}

		// 子窗口刷新
		const { renderWindow } = vtkSegToothContext;
		renderWindow.render();

		// 查看reArrangeToInitState, 如果有为true的, 就切换到false, 但实际上这里直接全切成false也可以, 会触发监听并重置小球
		store.dispatch("actorHandleState/updateDentalArchAdjustRecord", {
			upper: { reArrangeToInitState: false },
			lower: { reArrangeToInitState: false },
		});
	}
});
// 退出模拟排牙
function exitSimulationMode() {
	adjustActorWhenSwitchSimMode("exit",1);
	// 退出一定是退到normal的
	applyUserMatrixWhenSwitchMode(simMode.value, "normal", true);
}
function adjustActorWhenSwitchSimMode(switchType, clickEnter=false) {
	const { addActorsList, delActorsList } = adjustActorWhenSwitchSimulationMode(switchType, props.actorInScene, userType.value, clickEnter);
	actorInSceneAdjust(addActorsList, delActorsList);
}
// 强制更新模拟排牙
function forceUpdateArrange(reCalculateDentalArch = false, teethType = []) {
	let reArrangeTeethType = teethType.length > 0 ? teethType : arrangeTeethType.value;
	if (reArrangeTeethType.length > 0) {
		forceUpdateAtMode = fineTuneMode.value;
		// 读取当前排牙模式, 如果是从normal进来的则继续, 如果是在模拟排牙模式下则先退出
		store.dispatch("userHandleState/switchArrangeBarOpenState", true);
		// 模拟排牙
		const fineTunedBracketData = {};
		for (let teethType of reArrangeTeethType) {
			fineTunedBracketData[teethType] = Object.fromEntries(
				bracketData[teethType].map(({ name, fineTuneRecord: { actorMatrix } }) => [name, actorMatrix])
			);
		}
		startTeethArrange(fineTunedBracketData, reCalculateDentalArch);
	}
}

defineExpose({
	bracketData,
	applyUserMatrixWhenSwitchMode,
	forceUpdateArrange,
	resetView,
	resetAllBracket,
	resetSingleBracket,
	fineTuneBracket,
	uploadDataOnline,
	rollbackCheckedData,
	setDataCheckable,
	suyaDoctorAudit,
});
</script>

<style scoped lang="scss">
.origin {
	@import './viewerMainStyle.scss';
	height: 100%;
}
.new {
	@import './viewerMainStyle2.scss';
	height: 100%;
}
</style>