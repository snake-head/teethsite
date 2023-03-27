import macro from "@kitware/vtk.js/macro";
import vtkPolyData from "@kitware/vtk.js/Common/DataModel/PolyData";
import vtkDataArray from "@kitware/vtk.js/Common/Core/DataArray";
import vtkSphereSource from "@kitware/vtk.js/Filters/Sources/SphereSource";
import vtkCylinderSource from "@kitware/vtk.js/Filters/Sources/CylinderSource";
import {
    normalize,
    add,
    subtract,
    distance2BetweenPoints,
    multiplyScalar,
} from "@kitware/vtk.js/Common/Core/Math";

function vtkSphereLinkSource(publicAPI, model) {
    // Set our className
    model.classHierarchy.push("vtkSphereLinkSource");

    // --------------------------------------------------------------------------
    // Generic rendering pipeline
    // --------------------------------------------------------------------------

    model.linkCenter = [0, 0, 0];
    add(model.rightSphereCenter, model.leftSphereCenter, model.linkCenter);
    multiplyScalar(model.linkCenter, 0.5);
    model.linkDirection = [0, 0, 0];
    subtract(
        model.rightSphereCenter,
        model.leftSphereCenter,
        model.linkDirection
    );
    normalize(model.linkDirection);

    let centerDistance = Math.sqrt(
        distance2BetweenPoints(model.leftSphereCenter, model.rightSphereCenter)
    );
    model.modifyLinkRange = [
        centerDistance * model.modifyLinkRatio[0],
        centerDistance * model.modifyLinkRatio[1],
    ];
    // 更新左右小球中心点
    publicAPI.setCenters = (left, right) => {
        model.leftSphereCenter = [...left];
        model.rightSphereCenter = [...right];
        publicAPI.updateLinkByCurrentCenters();
    };
    publicAPI.getCenters = () => [
        model.leftSphereCenter,
        model.rightSphereCenter,
    ];
    
    publicAPI.updateLinkByCurrentCenters = () => {
        add(model.rightSphereCenter, model.leftSphereCenter, model.linkCenter);
        multiplyScalar(model.linkCenter, 0.5);
        subtract(
            model.rightSphereCenter,
            model.leftSphereCenter,
            model.linkDirection
        );
        normalize(model.linkDirection);
    };
    // 根据direction调整两球中心
    publicAPI.modifyLength = (moveVector = [0, 0, 0]) => {
        let modLength =
            model.linkDirection[0] * moveVector[0] +
            model.linkDirection[1] * moveVector[1] +
            model.linkDirection[2] * moveVector[2]; // |model.linkDirection|*|moveVector|*cosa
        // 移动距离均分
        let modifiedLinkLength =
            Math.sqrt(
                distance2BetweenPoints(
                    model.leftSphereCenter,
                    model.rightSphereCenter
                )
            ) + modLength;
        if (
            modifiedLinkLength < model.modifyLinkRange[0] ||
            modifiedLinkLength > model.modifyLinkRange[1]
        ) {
            return;
        }
        let centerMove = [...model.linkDirection];
        multiplyScalar(centerMove, modLength / 2);
        add(model.rightSphereCenter, centerMove, model.rightSphereCenter);
        subtract(model.leftSphereCenter, centerMove, model.leftSphereCenter);
        publicAPI.updateLinkByCurrentCenters();
    };

    publicAPI.requestData = (_inData, outData) => {
        if (model.deleted) {
            return;
        }
        const internalPolyData = vtkPolyData.newInstance();
        const leftSphere = vtkSphereSource.newInstance({
            radius: model.sphereRadius * model.scale,
            center: [...model.leftSphereCenter],
            phiResolution: model.phiResolution,
            thetaResolution: model.thetaResolution,
        });
        const rightSphere = vtkSphereSource.newInstance({
            radius: model.sphereRadius * model.scale,
            center: [...model.rightSphereCenter],
            phiResolution: model.phiResolution,
            thetaResolution: model.thetaResolution,
        });
        const cylinderLink = vtkCylinderSource.newInstance({
            center: model.linkCenter,
            height: Math.sqrt(
                distance2BetweenPoints(
                    model.leftSphereCenter,
                    model.rightSphereCenter
                )
            ),
            radius: model.linkRadius * model.scale,
            resolution: model.linkResolution,
            direction: model.linkDirection,
            capping: false,
        });

        const numLeftSpherePoints = leftSphere
            .getOutputData()
            .getPoints()
            .getNumberOfPoints();
        const numSpherePoints =
            numLeftSpherePoints +
            rightSphere
                .getOutputData()
                .getPoints()
                .getNumberOfPoints();

        internalPolyData.getPoints().setData(
            new Float32Array([
                ...leftSphere
                    .getOutputData()
                    .getPoints()
                    .getData(),
                ...rightSphere
                    .getOutputData()
                    .getPoints()
                    .getData(),
                ...cylinderLink
                    .getOutputData()
                    .getPoints()
                    .getData(),
            ])
        );
        internalPolyData.getPolys().setData(
            new Uint32Array([
                ...leftSphere
                    .getOutputData()
                    .getPolys()
                    .getData(),
                ...rightSphere
                    .getOutputData()
                    .getPolys()
                    .getData()
                    .map((_val, idx, arr) => {
                        return idx % 4 !== 0
                            ? (arr[idx] += numLeftSpherePoints)
                            : arr[idx];
                    }),
                ...cylinderLink
                    .getOutputData()
                    .getPolys()
                    .getData()
                    .map((_val, idx, arr) => {
                        return idx % 5 !== 0
                            ? (arr[idx] += numSpherePoints)
                            : arr[idx];
                    }),
            ])
        );
        const normalArray = vtkDataArray.newInstance({
            name: "Normals",
            values: new Float32Array([
                ...leftSphere
                    .getOutputData()
                    .getPointData()
                    .getNormals()
                    .getData(),
                ...rightSphere
                    .getOutputData()
                    .getPointData()
                    .getNormals()
                    .getData(),
                ...cylinderLink
                    .getOutputData()
                    .getPointData()
                    .getNormals()
                    .getData(),
            ]),
            numberOfComponents: 3,
        });
        internalPolyData.getPointData().setNormals(normalArray);
        outData[0] = internalPolyData;
    };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
    leftSphereCenter: [0, -10, 0],
    rightSphereCenter: [0, 10, 0],
    sphereRadius: 2,
    linkRadius: 0.25,
    phiResolution: 8,
    thetaResolution: 12,
    linkResolution: 8,
    scale: 1,
    modifyLinkRatio: [0.3, 3.33],
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
    Object.assign(model, DEFAULT_VALUES, initialValues);

    macro.obj(publicAPI, model);
    macro.setGet(publicAPI, model, [
        "leftSphereCenter",
        "rightSphereCenter",
        "sphereRadius",
        "linkRadius",
        "thetaResolution",
        "phiResolution",
        "linkResolution",
        "scale",
    ]); // 只要一改变这里的值, 自动调用requestData

    // 用于在外部强制调用requestData, 记得每次传一个不一样的值过来, 可以是当前时间或者搞一个计数器
    macro.setGet(publicAPI, model, ["newData"]);

    macro.getArray(publicAPI, model, ["linkDirection"]);

    macro.algo(publicAPI, model, 0, 1);

    // Object specific methods
    vtkSphereLinkSource(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend, "vtkSphereLinkSource");

// ----------------------------------------------------------------------------

export default { newInstance, extend };
