export const POPUP_STYLES = `
  .allo-popup-overlay {
    position: fixed;
    inset: 0;
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
  }
  .allo-popup-overlay.visible {
    opacity: 1;
    pointer-events: auto;
  }
  .allo-popup-overlay.pos-bottom-left {
    align-items: flex-end;
    justify-content: flex-start;
    padding: 24px;
  }
  .allo-popup-overlay.pos-bottom-right {
    align-items: flex-end;
    justify-content: flex-end;
    padding: 24px;
  }
  .allo-popup-overlay.pos-top-bar {
    align-items: flex-start;
  }
  .allo-popup-container {
    position: relative;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05);
    max-width: 420px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    transform: translateY(20px);
    transition: transform 0.3s ease;
  }
  .allo-popup-overlay.visible .allo-popup-container {
    transform: translateY(0);
  }
  .allo-popup-overlay.anim-scale .allo-popup-container {
    transform: scale(0.9);
  }
  .allo-popup-overlay.anim-scale.visible .allo-popup-container {
    transform: scale(1);
  }
  .allo-popup-overlay.anim-slide-up .allo-popup-container {
    transform: translateY(40px);
  }
  .allo-popup-overlay.anim-slide-up.visible .allo-popup-container {
    transform: translateY(0);
  }
  .allo-popup-overlay.anim-slide-down .allo-popup-container {
    transform: translateY(-40px);
  }
  .allo-popup-overlay.anim-slide-down.visible .allo-popup-container {
    transform: translateY(0);
  }
  .allo-popup-close {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 28px;
    height: 28px;
    border: none;
    background: rgba(0,0,0,0.06);
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: #666;
    transition: background 0.2s, color 0.2s;
    z-index: 1;
  }
  .allo-popup-close:hover {
    background: rgba(0,0,0,0.12);
    color: #333;
  }
  .allo-popup-body {
    padding: 8px;
  }
  .allo-popup-success {
    padding: 32px 24px;
    text-align: center;
  }
  .allo-popup-success h3 {
    font-size: 18px;
    font-weight: 700;
    color: #1a1a1a;
    margin: 0 0 8px;
  }
  .allo-popup-success p {
    font-size: 14px;
    color: #666;
    margin: 0;
  }
  .allo-popup-discount {
    margin-top: 16px;
    padding: 12px;
    background: #f0fdf4;
    border: 1px dashed #16a34a;
    border-radius: 8px;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 2px;
    color: #16a34a;
  }
`;
