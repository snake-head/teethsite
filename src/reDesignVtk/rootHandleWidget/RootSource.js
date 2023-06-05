import macro from "@kitware/vtk.js/macro";
import vtkPolyData from "@kitware/vtk.js/Common/DataModel/PolyData";
import vtkDataArray from "@kitware/vtk.js/Common/Core/DataArray";
import vtkSphereSource from "@kitware/vtk.js/Filters/Sources/SphereSource";
import vtkCylinderSource from "@kitware/vtk.js/Filters/Sources/CylinderSource";
import vtkConeSource from "@kitware/vtk.js/Filters/Sources/ConeSource";
import {
    normalize,
    add,
    subtract,
    distance2BetweenPoints,
    multiplyScalar,
    cross,
    dot,
    norm,
    multiplyMatrix
} from "@kitware/vtk.js/Common/Core/Math";
import vtkMatrixBuilder from "@kitware/vtk.js/Common/Core/MatrixBuilder"

function vtkRootSource(publicAPI, model) {
    // Set our className
    model.classHierarchy.push("vtkRootSource");

    // --------------------------------------------------------------------------
    // Generic rendering pipeline
    // --------------------------------------------------------------------------

    model.linkCenter = [0, 0, 0]; // 半径的中心
    add(model.bottomSphereCenter, model.radiusSphereCenter, model.linkCenter);
    multiplyScalar(model.linkCenter, 0.5);
    model.upLinkCenter = [0, 0, 0]; // 轴的中心
    add(model.bottomSphereCenter, model.topSphereCenter, model.upLinkCenter);
    multiplyScalar(model.upLinkCenter, 0.5);
    model.linkDirection = [0, 0, 0];
    subtract(
        model.radiusSphereCenter,
        model.bottomSphereCenter,
        model.linkDirection
    );
    normalize(model.linkDirection);
    model.upLinkDirection = [0, 0, 0];
    subtract(
        model.bottomSphereCenter,
        model.topSphereCenter,
        model.upLinkDirection
    );
    normalize(model.upLinkDirection);

    model.height = Math.sqrt(
        distance2BetweenPoints(model.bottomSphereCenter, model.topSphereCenter)
    );

    let centerDistance = Math.sqrt(
        distance2BetweenPoints(model.bottomSphereCenter, model.radiusSphereCenter)
    );
    model.modifyLinkRange = [
        centerDistance * model.modifyLinkRatio[0],
        centerDistance * model.modifyLinkRatio[1],
    ];
    // 更新左右小球中心点
    publicAPI.setCenters = (bottom, top, radius) => {
        model.topSphereCenter = [...top];
        model.bottomSphereCenter = [...bottom];
        model.radiusSphereCenter = [...radius];
        publicAPI.updateLinkByCurrentCenters();
    };
    publicAPI.getCenters = () => [
        model.bottomSphereCenter,
        model.topSphereCenter,
        model.radiusSphereCenter,
    ];
    
    publicAPI.updateLinkByCurrentCenters = () => {
        add(model.bottomSphereCenter, model.radiusSphereCenter, model.linkCenter);
        multiplyScalar(model.linkCenter, 0.5);
        add(model.bottomSphereCenter, model.topSphereCenter, model.upLinkCenter);
        multiplyScalar(model.upLinkCenter, 0.5);
        subtract(
            model.radiusSphereCenter,
            model.bottomSphereCenter,
            model.linkDirection
        );
        normalize(model.linkDirection);
        subtract(
            model.bottomSphereCenter,
            model.topSphereCenter,
            model.upLinkDirection
        );
        normalize(model.upLinkDirection);
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
                    model.bottomSphereCenter,
                    model.radiusSphereCenter
                )
            ) + modLength;
        if (
            modifiedLinkLength < model.modifyLinkRange[0] ||
            modifiedLinkLength > model.modifyLinkRange[1]
        ) {
            return;
        }
        let centerMove = [...model.linkDirection];
        multiplyScalar(centerMove, modLength);
        // add(model.bottomSphereCenter, centerMove, model.bottomSphereCenter);
        add(model.radiusSphereCenter, centerMove, model.radiusSphereCenter);
        publicAPI.updateLinkByCurrentCenters();
    };

    publicAPI.modifyRotateBottom = (pickPoint = [0, 0, 0]) => {
        var direction=[];
        subtract(pickPoint,model.topSphereCenter,direction);
        normalize(direction);
        multiplyScalar(direction,model.height);
        var targetPoint=[];
        add(model.topSphereCenter,direction,targetPoint);
        var AB=[]; //假设圆锥顶点为A，底面圆心为B，半径上的点为D，旋转后的B点为C
        subtract(model.bottomSphereCenter,model.topSphereCenter,AB);
        var AC=[];
        subtract(targetPoint,model.topSphereCenter,AC);
        var normal=[];
        cross(AB,AC,normal);
        normalize(normal)

        // 计算以A为原点的B点和D点坐标
        let B_prime = subtract(model.bottomSphereCenter, model.topSphereCenter, []);
        let C_prime = subtract(targetPoint, model.topSphereCenter, []);
        let D_prime = subtract(model.radiusSphereCenter, model.topSphereCenter, []);

        // 计算B点和C点之间的夹角
        let cosTheta = dot(B_prime, C_prime) / (norm(B_prime) * norm(C_prime));
        let theta = Math.acos(cosTheta);
        vtkMatrixBuilder.buildFromDegree().rotate(theta*180/Math.PI,normal).apply(D_prime);
        model.radiusSphereCenter = add(model.topSphereCenter,D_prime,[])

        model.bottomSphereCenter = targetPoint;
        publicAPI.updateLinkByCurrentCenters();
    };

    publicAPI.modifyRotateTop = (pickPoint = [0, 0, 0]) => {
        var direction=[];
        subtract(pickPoint,model.bottomSphereCenter,direction);
        normalize(direction);
        multiplyScalar(direction,model.height);
        var targetPoint=[];
        add(model.bottomSphereCenter,direction,targetPoint);
        var AB=[]; //假设圆锥顶点为B，底面圆心为A，半径上的点为D，旋转后的B点为C
        subtract(model.topSphereCenter,model.bottomSphereCenter,AB);
        var AC=[];
        subtract(targetPoint,model.bottomSphereCenter,AC);
        var normal=[];
        cross(AB,AC,normal);
        normalize(normal)

        // 计算以A为原点的B点和D点坐标
        let B_prime = subtract(model.topSphereCenter, model.bottomSphereCenter, []);
        let C_prime = subtract(targetPoint, model.bottomSphereCenter, []);
        let D_prime = subtract(model.radiusSphereCenter, model.bottomSphereCenter, []);

        // 计算B点和C点之间的夹角
        let cosTheta = dot(B_prime, C_prime) / (norm(B_prime) * norm(C_prime));
        let theta = Math.acos(cosTheta);
        vtkMatrixBuilder.buildFromDegree().rotate(theta*180/Math.PI,normal).apply(D_prime);
        model.radiusSphereCenter = add(model.bottomSphereCenter,D_prime,[])

        model.topSphereCenter = targetPoint;
        publicAPI.updateLinkByCurrentCenters();
    };

    publicAPI.requestData = (_inData, outData) => {
        if (model.deleted) {
            return;
        }
        const internalPolyData = vtkPolyData.newInstance();
        const bottomSphere = vtkSphereSource.newInstance({
            radius: model.sphereRadius * model.scale,
            center: [...model.bottomSphereCenter],
            phiResolution: model.phiResolution,
            thetaResolution: model.thetaResolution,
        });
        const topSphere = vtkSphereSource.newInstance({
            radius: model.sphereRadius * model.scale,
            center: [...model.topSphereCenter],
            phiResolution: model.phiResolution,
            thetaResolution: model.thetaResolution,
        });
        const radiusSphere = vtkSphereSource.newInstance({
            radius: model.sphereRadius * model.scale,
            center: [...model.radiusSphereCenter],
            phiResolution: model.phiResolution,
            thetaResolution: model.thetaResolution,
        });
        const cylinderLink = vtkCylinderSource.newInstance({
            center: model.linkCenter,
            height: Math.sqrt(
                distance2BetweenPoints(
                    model.bottomSphereCenter,
                    model.radiusSphereCenter
                )
            ),
            radius: model.linkRadius * model.scale,
            resolution: model.linkResolution,
            direction: model.linkDirection,
            capping: false,
        });
        const cylinderUpLink = vtkCylinderSource.newInstance({
            center: model.upLinkCenter,
            height: Math.sqrt(
                distance2BetweenPoints(
                    model.bottomSphereCenter,
                    model.topSphereCenter
                )
            ),
            radius: model.linkRadius * model.scale,
            resolution: model.linkResolution,
            direction: model.upLinkDirection,
            capping: false,
        });
        const cone = vtkConeSource.newInstance({
            height: Math.sqrt(
                distance2BetweenPoints(
                    model.bottomSphereCenter,
                    model.topSphereCenter
                )
            ),
            radius: Math.sqrt(
                distance2BetweenPoints(
                    model.bottomSphereCenter,
                    model.radiusSphereCenter
                )
            ),
            direction: multiplyScalar([...model.upLinkDirection],-1),
            center: model.upLinkCenter,
            resolution: model.coneResolution,
        })

        const numCylinderPoints = cylinderLink
            .getOutputData()
            .getPoints()
            .getNumberOfPoints();

        internalPolyData.getPoints().setData(
            new Float32Array([
                ...cylinderLink
                    .getOutputData()
                    .getPoints()
                    .getData(),
                ...cylinderUpLink
                    .getOutputData()
                    .getPoints()
                    .getData(),
            ])
        );
        internalPolyData.getPolys().setData(
            new Uint32Array([
                ...cylinderLink
                    .getOutputData()
                    .getPolys()
                    .getData()
                    .map((_val, idx, arr) => {
                        return idx % 5 !== 0
                            ? (arr[idx])
                            : arr[idx];
                    }),
                ...cylinderUpLink
                    .getOutputData()
                    .getPolys()
                    .getData()
                    .map((_val, idx, arr) => {
                        return idx % 5 !== 0
                            ? (arr[idx] + numCylinderPoints)
                            : arr[idx];
                    }),
            ])
        );
        const normalArray = vtkDataArray.newInstance({
            name: "Normals",
            values: new Float32Array([
                ...cylinderLink
                    .getOutputData()
                    .getPointData()
                    .getNormals()
                    .getData(),
                ...cylinderUpLink
                    .getOutputData()
                    .getPointData()
                    .getNormals()
                    .getData(),
            ]),
            numberOfComponents: 3,
        });
        internalPolyData.getPointData().setNormals(normalArray);
        outData[0] = internalPolyData;
        outData[1] = bottomSphere.getOutputData();
        outData[2] = topSphere.getOutputData();
        outData[3] = radiusSphere.getOutputData();
        outData[4] = cone.getOutputData();
    };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
    bottomSphereCenter: [0, 0, 0],
    topSphereCenter: [0, 100, 0],
    radiusSphereCenter: [50, 0, 0],
    sphereRadius: 2,
    linkRadius: 0.25,
    phiResolution: 8,
    thetaResolution: 12,
    linkResolution: 8,
    coneResolution: 80,
    scale: 1,
    modifyLinkRatio: [0.01, 100],
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
    Object.assign(model, DEFAULT_VALUES, initialValues);

    macro.obj(publicAPI, model);
    macro.setGet(publicAPI, model, [
        "bottomSphereCenter",
        "topSphereCenter",
        "radiusSphereCenter",
        "sphereRadius",
        "linkRadius",
        "thetaResolution",
        "phiResolution",
        "linkResolution",
        "coneResolution",
        "scale",
    ]); // 只要一改变这里的值, 自动调用requestData

    // 用于在外部强制调用requestData, 记得每次传一个不一样的值过来, 可以是当前时间或者搞一个计数器
    macro.setGet(publicAPI, model, ["newData"]);

    macro.getArray(publicAPI, model, ["linkDirection"]);

    macro.algo(publicAPI, model, 0, 5); // 需要将每个球分别输出

    // Object specific methods
    vtkRootSource(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend, "vtkRootSource");

// ----------------------------------------------------------------------------

export default { newInstance, extend };
