/*
 * @Description: 
 * @Version: 1.0
 * @Autor: ZhuYichen
 * @Date: 2024-07-03 10:58:58
 * @LastEditors: ZhouZiyu
 * @LastEditTime: 2024-07-30 21:21:14
 */
import { m as macro } from '@kitware/vtk.js/macros2.js';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor.js';
import vtkGlyphRepresentation from '@kitware/vtk.js/Widgets/Representations/GlyphRepresentation.js';
import vtkPixelSpaceCallbackMapper from '@kitware/vtk.js/Rendering/Core/PixelSpaceCallbackMapper.js';

// ----------------------------------------------------------------------------
// vtkLineHandleRepresentation methods
// ----------------------------------------------------------------------------

function vtkLineHandleRepresentation(publicAPI, model) {
  // Set our className
  model.classHierarchy.push('vtkLineHandleRepresentation');

  // --------------------------------------------------------------------------
  // Generic rendering pipeline
  // --------------------------------------------------------------------------

  /*
   * displayActors and displayMappers are used to render objects in HTML, allowing objects
   * to be 'rendered' internally in a VTK scene without being visible on the final output
   */

  model.displayMapper = vtkPixelSpaceCallbackMapper.newInstance();
  model.displayActor = vtkActor.newInstance({
    parentProp: publicAPI
  });
  model.displayActor.getProperty().setOpacity(0.4); // don't show in 3D
  model.displayActor.setMapper(model.displayMapper);
  model.displayMapper.setInputConnection(publicAPI.getOutputPort());
  publicAPI.addActor(model.displayActor);
  model.alwaysVisibleActors = [model.displayActor];

  // --------------------------------------------------------------------------

  publicAPI.getGlyphResolution = () => model._pipeline.glyph.getPhiResolution();
  publicAPI.setGlyphResolution = resolution => model._pipeline.glyph.setPhiResolution(resolution) || model._pipeline.glyph.setThetaResolution(resolution);

  // --------------------------------------------------------------------------

  function callbackProxy(coords) {
    if (model.displayCallback) {
      const filteredList = [];
      const states = publicAPI.getRepresentationStates();
      for (let i = 0; i < states.length; i++) {
        if (states[i].getActive()) {
          filteredList.push(coords[i]);
        }
      }
      if (filteredList.length) {
        model.displayCallback(filteredList);
        return;
      }
    }
    model.displayCallback();
  }
  publicAPI.setDisplayCallback = callback => {
    model.displayCallback = callback;
    model.displayMapper.setCallback(callback ? callbackProxy : null);
  };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------

function extend(publicAPI, model) {
  let initialValues = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  vtkGlyphRepresentation.extend(publicAPI, model, initialValues);

  // Object specific methods
  vtkLineHandleRepresentation(publicAPI, model);
}

// ----------------------------------------------------------------------------

const newInstance = macro.newInstance(extend, 'vtkLineHandleRepresentation');

// ----------------------------------------------------------------------------

var vtkLineHandleRepresentation$1 = {
  newInstance,
  extend
};

export { vtkLineHandleRepresentation$1 as default, extend, newInstance };
