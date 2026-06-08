import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Redirect HTML5 video fullscreen requests to the nearest main course view container.
// This allows overlay screens like completion messages and note editors to stay on top in fullscreen.
const originalRequestFullscreen = HTMLVideoElement.prototype.requestFullscreen;
if (originalRequestFullscreen) {
  HTMLVideoElement.prototype.requestFullscreen = function (options?: FullscreenOptions) {
    if (document.fullscreenElement) {
      return document.exitFullscreen();
    }
    const container = this.closest('.course-view-main') || this.parentElement;
    if (container) {
      return container.requestFullscreen(options);
    }
    return originalRequestFullscreen.call(this, options);
  };
}

const originalWebKitRequestFullscreen = (HTMLVideoElement.prototype as any).webkitRequestFullscreen;
if (originalWebKitRequestFullscreen) {
  (HTMLVideoElement.prototype as any).webkitRequestFullscreen = function (options?: any) {
    if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
      const exitFn = document.exitFullscreen || (document as any).webkitExitFullscreen;
      if (exitFn) {
        return exitFn.call(document);
      }
    }
    const container = this.closest('.course-view-main') || this.parentElement;
    if (container) {
      if (container.requestFullscreen) {
        return container.requestFullscreen(options);
      } else if ((container as any).webkitRequestFullscreen) {
        return (container as any).webkitRequestFullscreen(options);
      }
    }
    return originalWebKitRequestFullscreen.call(this, options);
  };
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

