import macro from "@kitware/vtk.js/macro";
import vtkAppendPolyData from "@kitware/vtk.js/Filters/General/AppendPolyData";
import vtkConeSource from "@kitware/vtk.js/Filters/Sources/ConeSource";
import vtkCylinderSource from "@kitware/vtk.js/Filters/Sources/CylinderSource";
import vtkMatrixBuilder from "@kitware/vtk.js/Common/Core/MatrixBuilder";
import vtkCircleSource from "@kitware/vtk.js/Filters/Sources/CircleSource";
import vtkMath from "@kitware/vtk.js/Common/Core/Math";

// ----------------------------------------------------------------------------
// vtkArrowSource methods
// ----------------------------------------------------------------------------

function vtkArrowSource(publicAPI, model) {
    // Set our className
    model.classHierarchy.push("vtkArrowSource");

    function requestData(inData, outData) {
        if (model.deleted) {
            return;
        }

        const cylinder = vtkCylinderSource.newInstance({ capping: true });
        cylinder.setResolution(model.shaftResolution);
        cylinder.setRadius(model.shaftRadius);
        cylinder.setHeight(model.axesLength * (1.0 - model.tipLength));
        cylinder.setCenter(
            0,
            model.axesLength * (1.0 - model.tipLength) * 0.5,
            0.0
        );

        const cylinderPD = cylinder.getOutputData();
        const cylinderPts = cylinderPD.getPoints().getData();
        const cylinderNormals = cylinderPD
            .getPointData()
            .getNormals()
            .getData();

        // Apply transformation to the cylinder
        vtkMatrixBuilder
            .buildFromDegree()
            .rotateZ(-90)
            .apply(cylinderPts)
            .apply(cylinderNormals);

        const cone = vtkConeSource.newInstance();
        cone.setResolution(model.tipResolution);
        cone.setHeight(model.axesLength * model.tipLength);
        cone.setRadius(model.tipRadius);

        const conePD = cone.getOutputData();
        const conePts = conePD.getPoints().getData();

        // Apply transformation to the cone
        vtkMatrixBuilder
            .buildFromRadian()
            .translate(
                model.axesLength * (1.0 - model.tipLength * 0.5),
                0.0,
                0.0
            )
            .apply(conePts);

        const append = vtkAppendPolyData.newInstance();
        append.setInputData(cylinderPD);
        append.addInputData(conePD);

        if (model.withCircumCircle) {
            const circle = vtkCircleSource.newInstance();
            circle.setCenter([model.axesLength * 0.5, 0, 0]);
            circle.setRadius(model.axesLength * 0.5);
            circle.setFace(false);
            circle.setLines(true);
            circle.setResolution(Math.round(model.axesLength * Math.PI));
            const circlePD = circle.getOutputData();
            append.addInputData(circlePD);
        }

        const appendPD = append.getOutputData();
        const appendPts = appendPD.getPoints().getData();
        // Center the arrow about [0, 0, 0]
        vtkMatrixBuilder
            .buildFromRadian()
            .translate(
                model.axesLength * (-0.5 + model.tipLength * 0.5),
                0.0,
                0.0
            )
            .apply(appendPts);

        if (model.invert) {
            // Apply transformation to the arrow
            vtkMatrixBuilder
                .buildFromRadian()
                .rotateFromDirections([1, 0, 0], model.direction)
                .scale(-1, -1, -1)
                .apply(appendPts);

            // Update output
            outData[0] = appendPD;
        } else {
            // Apply transformation to the arrow
            vtkMatrixBuilder
                .buildFromRadian()
                .rotateFromDirections([1, 0, 0], model.direction)
                .scale(1, 1, 1)
                .apply(appendPts);

            // Update output
            outData[0] = append.getOutputData();
        }
    }

    // Expose methods
    publicAPI.requestData = requestData;
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
    tipResolution: 6,
    tipRadius: 0.1,
    tipLength: 0.35,
    shaftResolution: 6,
    shaftRadius: 0.03,
    invert: false,
    direction: [1.0, 0.0, 0.0],
    pointType: "Float32Array",
    axesLength: 1.0, // 新增,  控制轴长度
    withCircumCircle: false, // 新增, 是否画外接圆
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
    Object.assign(model, DEFAULT_VALUES, initialValues);

    // Build VTK API
    macro.obj(publicAPI, model);
    macro.setGet(publicAPI, model, [
        "tipResolution",
        "tipRadius",
        "tipLength",
        "shaftResolution",
        "shaftRadius",
        "invert",
        "withCircumCircle",
    ]);
    macro.setGetArray(publicAPI, model, ["direction"], 3);
    macro.algo(publicAPI, model, 0, 1);
    vtkArrowSource(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend, "vtkArrowSource");

// ----------------------------------------------------------------------------

export default { newInstance, extend };
