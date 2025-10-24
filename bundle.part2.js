(function() {
    'use strict';
    const { useState, useRef, useCallback, useEffect, useMemo, StrictMode, Fragment } = React;
    
    // Get dependencies from the global scope set by part 1
    const { helpers, Units, furnitureLibrary, ActionButton, FurnitureLibraryUI, TraceImagePanel, PropertiesPanel } = window;
    const { 
        pointToSegmentDistance, findClosestPointOnSegment, findRoomFromPoint, isPointInPolygon, 
        calculatePolygonArea, calculatePolygonCentroid, generateCircularArcPath, polarToCartesian 
    } = helpers;
    const { FURNITURE_LIBRARY, FURNITURE_DIMENSIONS, FurnitureRenderer } = furnitureLibrary;
	const DEFAULT_FURNITURE_SCALE = 10;
	const DEFAULT_THICKNESS = 10;
    // --- Start of transpiled components/Canvas.tsx ---

    const HANDLE_RADIUS = 10;

    const DynamicGrid = ({ view, canvasContainerRef }) => {
        if (!canvasContainerRef.current) return null;
        const { width, height } = canvasContainerRef.current.getBoundingClientRect();
        const viewMinX = -view.offsetX / view.scale;
        const viewMinY = -view.offsetY / view.scale;
        const viewMaxX = (width - view.offsetX) / view.scale;
        const viewMaxY = (height - view.offsetY) / view.scale;
        
        const gridLevels = [
          { spacing: 1000, stroke: '#475569', strokeWidth: 1 },
          { spacing: 100, stroke: '#334152', strokeWidth: 0.75 },
          { spacing: 10, stroke: '#273345', strokeWidth: 0.5 }
        ];
    
        return (
          React.createElement('g', null,
            gridLevels.map(({ spacing, stroke, strokeWidth }) => {
                if (spacing * view.scale < 25) return null;
                const lines = [];
                const startX = Math.floor(viewMinX / spacing) * spacing;
                for (let x = startX; x <= viewMaxX; x += spacing) { lines.push(React.createElement('line', { key: `v${spacing}-${x}`, x1: x, y1: viewMinY, x2: x, y2: viewMaxY, stroke: stroke, strokeWidth: strokeWidth / view.scale })); }
                const startY = Math.floor(viewMinY / spacing) * spacing;
                for (let y = startY; y <= viewMaxY; y += spacing) { lines.push(React.createElement('line', { key: `h${spacing}-${y}`, x1: viewMinX, y1: y, x2: viewMaxX, y2: y, stroke: stroke, strokeWidth: strokeWidth / view.scale })); }
                return lines;
            })
          )
        );
    };
    
    const DimensionLineRenderer = ({ line, isSelected, viewScale }) => {
      const color = isSelected ? '#a78bfa' : '#64748b';
      const dx = line.x2 - line.x1;
      const dy = line.y2 - line.y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) return null;
    
      const nx = -dy / len;
      const ny = dx / len;
      const offsetX = line.offset * nx;
      const offsetY = line.offset * ny;
    
      const p1_off = { x: line.x1 + offsetX, y: line.y1 + offsetY };
      const p2_off = { x: line.x2 + offsetX, y: line.y2 + offsetY };
      
      const tickSize = 8 / viewScale;
      const extension = 12 / viewScale;
    
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      let textAngle = angle;
      if (textAngle > 90) textAngle -= 180;
      if (textAngle < -90) textAngle += 180;
    
      const textContent = len.toFixed(1);
      const fontSize = 12 / viewScale;
      const textWidth = textContent.length * fontSize * 0.6;
      const textHeight = fontSize * 1.2;
      
      return (
        React.createElement('g', null,
          React.createElement('line', { x1: line.x1, y1: line.y1, x2: p1_off.x + nx * extension, y2: p1_off.y + ny * extension, stroke: color, strokeWidth: 1 / viewScale }),
          React.createElement('line', { x1: line.x2, y1: line.y2, x2: p2_off.x + nx * extension, y2: p2_off.y + ny * extension, stroke: color, strokeWidth: 1 / viewScale }),
          React.createElement('line', { x1: p1_off.x, y1: p1_off.y, x2: p2_off.x, y2: p2_off.y, stroke: color, strokeWidth: 1 / viewScale }),
          React.createElement('line', { x1: p1_off.x - ny * tickSize, y1: p1_off.y + nx * tickSize, x2: p1_off.x + ny * tickSize, y2: p1_off.y - nx * tickSize, stroke: color, strokeWidth: 1.5 / viewScale }),
          React.createElement('line', { x1: p2_off.x - ny * tickSize, y1: p2_off.y + nx * tickSize, x2: p2_off.x + ny * tickSize, y2: p2_off.y - nx * tickSize, stroke: color, strokeWidth: 1.5 / viewScale }),
          React.createElement('g', { transform: `translate(${(p1_off.x + p2_off.x)/2} ${(p1_off.y + p2_off.y)/2}) rotate(${textAngle})`},
            React.createElement('rect', { x: -textWidth/2, y: -textHeight/2, width: textWidth, height: textHeight, fill: "#1e293b", 'data-text-bg': "true" }),
            React.createElement('text', { textAnchor: "middle", dominantBaseline: "middle", fill: color, fontSize: fontSize, className: "select-none" }, textContent)
          )
        )
      );
    };
    
    const DoorWindowRenderer = ({item, wall, isSelected, viewScale}) => {
      const isDoor = 'type' in item;
      const color = isSelected ? '#22d3ee' : '#cbd5e0';
      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const wallLen = Math.sqrt(dx * dx + dy * dy);
      if (wallLen === 0) return null;
    
      const t = item.offset / wallLen;
      const cx = wall.x1 + t * dx;
      const cy = wall.y1 + t * dy;
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    
      const halfWidth = item.width / 2;
      const halfThick = wall.thickness / 2;
      
      const leafStrokeWidth = 2.5 / viewScale;
      const arcStrokeWidth = 1 / viewScale;
      const frameWidth = 3 / viewScale;
      const arcDashArray = `${4 / viewScale} ${2 / viewScale}`;
    
      const renderSingleDoor = () => {
        const door = item;
        const hingeX = door.swing === 'left' ? -halfWidth : halfWidth;
        const hingeY = door.side === 'side1' ? -halfThick : halfThick;
        const openDir = door.side === 'side1' ? 1 : -1;
        const leafWidth = door.width;
        
        const closedDoorTipX = hingeX + (door.swing === 'left' ? leafWidth : -leafWidth);
        const openDoorTipX = hingeX;
        const openDoorTipY = hingeY + openDir * leafWidth;
        
        const sweepFlag = (door.swing === 'left' && door.side === 'side1') || (door.swing === 'right' && door.side === 'side2') ? 1 : 0;
        
        return (
          React.createElement('g', null,
            React.createElement('line', { x1: -halfWidth, y1: -halfThick, x2: -halfWidth, y2: halfThick, stroke: color, strokeWidth: frameWidth }),
            React.createElement('line', { x1: halfWidth, y1: -halfThick, x2: halfWidth, y2: halfThick, stroke: color, strokeWidth: frameWidth }),
            React.createElement('line', { x1: hingeX, y1: hingeY, x2: openDoorTipX, y2: openDoorTipY, strokeWidth: leafStrokeWidth }),
            React.createElement('path', { d: `M ${closedDoorTipX} ${hingeY} A ${leafWidth} ${leafWidth} 0 0 ${sweepFlag} ${openDoorTipX} ${openDoorTipY}`, strokeWidth: arcStrokeWidth, strokeDasharray: arcDashArray })
          )
        );
      };
    
      const renderDoubleDoor = () => {
        const door = item;
        const leafWidth = door.width / 2;
        const hingeY = door.side === 'side1' ? -halfThick : halfThick;
        const openDir = door.side === 'side1' ? 1 : -1;
       
        const leftHingeX = -halfWidth;
        const leftClosedTipX = 0;
        const leftOpenTipX = leftHingeX;
        const leftOpenTipY = hingeY + openDir * leafWidth;
        const leftSweep = door.side === 'side1' ? 1 : 0;

        const rightHingeX = halfWidth;
        const rightClosedTipX = 0;
        const rightOpenTipX = rightHingeX;
        const rightOpenTipY = hingeY + openDir * leafWidth;
        const rightSweep = door.side === 'side1' ? 0 : 1;

        return (
            React.createElement('g', null,
                React.createElement('line', { x1: -halfWidth, y1: -halfThick, x2: -halfWidth, y2: halfThick, stroke: color, strokeWidth: frameWidth }),
                React.createElement('line', { x1: halfWidth, y1: -halfThick, x2: halfWidth, y2: halfThick, stroke: color, strokeWidth: frameWidth }),
                React.createElement('g', null,
                    React.createElement('line', { x1: leftHingeX, y1: hingeY, x2: leftOpenTipX, y2: leftOpenTipY, strokeWidth: leafStrokeWidth }),
                    React.createElement('path', { d: `M ${leftClosedTipX} ${hingeY} A ${leafWidth} ${leafWidth} 0 0 ${leftSweep} ${leftOpenTipX} ${leftOpenTipY}`, strokeWidth: arcStrokeWidth, strokeDasharray: arcDashArray})
                ),
                React.createElement('g', null,
                    React.createElement('line', { x1: rightHingeX, y1: hingeY, x2: rightOpenTipX, y2: rightOpenTipY, strokeWidth: leafStrokeWidth }),
                    React.createElement('path', { d: `M ${rightClosedTipX} ${hingeY} A ${leafWidth} ${leafWidth} 0 0 ${rightSweep} ${rightOpenTipX} ${rightOpenTipY}`, strokeWidth: arcStrokeWidth, strokeDasharray: arcDashArray})
                )
            )
        );
      };

      const renderFourPanelDoor = () => {
          const door = item;
          const leafWidth = door.width / 4;
          const hingeY = door.side === 'side1' ? -halfThick : halfThick;
          const openDir = door.side === 'side1' ? 1 : -1;

          const leftSweep = door.side === 'side1' ? 1 : 0;
          const rightSweep = door.side === 'side1' ? 0 : 1;

          const renderSingleSwing = (hingeX, closedTipX, sweep) => {
              const openTipX = hingeX;
              const openTipY = hingeY + openDir * leafWidth;
              return (
                  React.createElement('g', null,
                      React.createElement('line', { x1: hingeX, y1: hingeY, x2: openTipX, y2: openTipY, strokeWidth: leafStrokeWidth }),
                      React.createElement('path', { d: `M ${closedTipX} ${hingeY} A ${leafWidth} ${leafWidth} 0 0 ${sweep} ${openTipX} ${openTipY}`, strokeWidth: arcStrokeWidth, strokeDasharray: arcDashArray})
                  )
              );
          };

          return (
            React.createElement('g', null,
              React.createElement('line', { x1: -halfWidth, y1: -halfThick, x2: -halfWidth, y2: halfThick, stroke: color, strokeWidth: frameWidth }),
              React.createElement('line', { x1: halfWidth, y1: -halfThick, x2: halfWidth, y2: halfThick, stroke: color, strokeWidth: frameWidth }),
              renderSingleSwing(-halfWidth, -halfWidth + leafWidth, leftSweep),
              renderSingleSwing(-halfWidth + leafWidth, 0, leftSweep),
              renderSingleSwing(halfWidth - leafWidth, 0, rightSweep),
              renderSingleSwing(halfWidth, halfWidth - leafWidth, rightSweep)
            )
          );
      };

      const renderSlidingDoor = () => {
        return (
            React.createElement('g', { stroke: color },
                React.createElement('rect', { x: -halfWidth, y: -halfThick, width: item.width, height: wall.thickness, strokeWidth: leafStrokeWidth, fill: 'none' }),
                React.createElement('line', { x1: 0, y1: -halfThick, x2: 0, y2: halfThick, strokeWidth: arcStrokeWidth })
            )
        );
      };

      const renderWindow = () => {
        return (
            React.createElement('g', { stroke: color, fill: "none" },
                React.createElement('rect', { x: -halfWidth, y: -halfThick, width: item.width, height: wall.thickness, strokeWidth: leafStrokeWidth }),
                React.createElement('line', { x1: -halfWidth, y1: 0, x2: halfWidth, y2: 0, strokeWidth: arcStrokeWidth})
            )
        );
      };
    
      const hitBoxPadding = 5 / viewScale;
    
      return (
        React.createElement('g', { transform: `translate(${cx} ${cy}) rotate(${angle})` },
          React.createElement('g', { stroke: color, fill: "none" },
            isDoor ?
              (item.type === 'single' ? renderSingleDoor() :
               item.type === 'double' ? renderDoubleDoor() :
               item.type === 'four-panel' ? renderFourPanelDoor() :
               renderSlidingDoor()) :
              renderWindow()
          ),
          React.createElement('rect', { x: -halfWidth - hitBoxPadding, y: -halfThick - hitBoxPadding, width: item.width + 2 * hitBoxPadding, height: wall.thickness + 2 * hitBoxPadding, fill: "transparent", 'data-drag-handle': `${isDoor ? 'door' : 'window'}:${item.id}`, className: "cursor-pointer" }),
          isSelected && isDoor && React.createElement('g', { fill: "white", stroke: "black", strokeWidth: 0.5/viewScale, className: "cursor-pointer" },
             React.createElement('circle', { cx: 0, cy: -wall.thickness, r: HANDLE_RADIUS/viewScale/1.5, 'data-drag-handle': `door-flip-side:${item.id}` }),
             React.createElement('circle', { cx: 0, cy: wall.thickness, r: HANDLE_RADIUS/viewScale/1.5, 'data-drag-handle': `door-flip-side:${item.id}` }),
             React.createElement('circle', { cx: -item.width/2 - wall.thickness, cy: 0, r: HANDLE_RADIUS/viewScale/1.5, 'data-drag-handle': `door-flip-swing:${item.id}` }),
             React.createElement('circle', { cx: item.width/2 + wall.thickness, cy: 0, r: HANDLE_RADIUS/viewScale/1.5, 'data-drag-handle': `door-flip-swing:${item.id}` })
          )
        )
      );
    };


    const Canvas = (props) => {
      const {
        svgRef, project, view, mode, isPanning,
        selectedWallId, selectedRoomId, selectedTextId, selectedFurnitureId, selectedArcId, selectedCircularArcId, selectedRectangleId, selectedDimensionLineId, selectedDoorId, selectedWindowId,
        drawingState, hoveredRoomPolygon, wallStyle, arcStyle, rectangleStyle, canvasContainerRef,
        cursorWorldPos, showGrid, showOriginAxes, traceImage,
        onWheel, onMouseDown, onMouseMove, onMouseLeave, onTouchStart, onTouchMove, onTouchEnd
      } = props;

      useEffect(() => {
        const element = svgRef.current;
        if (!element) return;

        const wheelListener = (e) => onWheel(e);
        const touchStartListener = (e) => onTouchStart(e);
        const touchMoveListener = (e) => onTouchMove(e);
        const touchEndListener = (e) => onTouchEnd(e);

        element.addEventListener('wheel', wheelListener, { passive: false });
        element.addEventListener('touchstart', touchStartListener, { passive: false });
        element.addEventListener('touchmove', touchMoveListener, { passive: false });
        element.addEventListener('touchend', touchEndListener, { passive: false });

        return () => {
            element.removeEventListener('wheel', wheelListener);
            element.removeEventListener('touchstart', touchStartListener);
            element.removeEventListener('touchmove', touchMoveListener);
            element.removeEventListener('touchend', touchEndListener);
        };
      }, [svgRef, onWheel, onTouchStart, onTouchMove, onTouchEnd]);
      
      const selectedWall = project.walls.find(w => w.id === selectedWallId);
      const selectedFurniture = project.furniture.find(f => f.id === selectedFurnitureId);
      const selectedArc = project.arcs.find(a => a.id === selectedArcId);
      const selectedCircularArc = project.circularArcs.find(a => a.id === selectedCircularArcId);
      const selectedRectangle = project.rectangles.find(r => r.id === selectedRectangleId);
      const selectedDimensionLine = project.dimensionLines.find(d => d.id === selectedDimensionLineId);

      const viewBounds = useMemo(() => {
        if (!canvasContainerRef.current) return { viewMinX: 0, viewMinY: 0, viewMaxX: 0, viewMaxY: 0 };
        const { width, height } = canvasContainerRef.current.getBoundingClientRect();
        return {
          viewMinX: -view.offsetX / view.scale,
          viewMinY: -view.offsetY / view.scale,
          viewMaxX: (width - view.offsetX) / view.scale,
          viewMaxY: (height - view.offsetY) / view.scale,
        };
      }, [canvasContainerRef.current, view.offsetX, view.offsetY, view.scale]);


      return (
        React.createElement('svg', { ref: svgRef, className: `w-full h-full touch-none ${isPanning ? 'cursor-grabbing' : mode === 'select' ? 'cursor-grab' : 'cursor-crosshair'}`,
          onMouseDown: onMouseDown, onMouseMove: onMouseMove, onMouseLeave: onMouseLeave},
          React.createElement('rect', { width: "100%", height: "100%", fill: "#1e293b" }),
          React.createElement('g', { transform: `translate(${view.offsetX} ${view.offsetY}) scale(${view.scale})` },
            React.createElement('g', { 'data-export-ignore': "true" },
              traceImage && traceImage.visible && React.createElement('image', {
                href: traceImage.url, x: traceImage.x, y: traceImage.y,
                width: traceImage.width, height: traceImage.height,
                opacity: traceImage.opacity, pointerEvents: "none"
              }),
              showGrid && React.createElement(DynamicGrid, { view: view, canvasContainerRef: canvasContainerRef }),
              showOriginAxes && React.createElement(Fragment, null,
                React.createElement('line', { x1: "-100000", y1: "0", x2: "100000", y2: "0", stroke: "#f87171", strokeOpacity: "0.5", strokeWidth: 1 / view.scale }),
                React.createElement('line', { x1: "0", y1: "-100000", x2: "0", y2: "100000", stroke: "#4ade80", strokeOpacity: "0.5", strokeWidth: 1 / view.scale })
              )
            ),
            (mode === 'draw_wall' || mode === 'draw_door' || mode === 'draw_window') && cursorWorldPos && (
              React.createElement('g', { pointerEvents: "none", opacity: "0.5", 'data-export-ignore': "true" },
                React.createElement('line', {
                  x1: viewBounds.viewMinX, y1: cursorWorldPos.y,
                  x2: viewBounds.viewMaxX, y2: cursorWorldPos.y,
                  stroke: "#22d3ee", strokeWidth: 1 / view.scale, strokeDasharray: `${4 / view.scale} ${4 / view.scale}`
                }),
                React.createElement('line', {
                  x1: cursorWorldPos.x, y1: viewBounds.viewMinY,
                  x2: cursorWorldPos.x, y2: viewBounds.viewMaxY,
                  stroke: "#22d3ee", strokeWidth: 1 / view.scale, strokeDasharray: `${4 / view.scale} ${4 / view.scale}`
                })
              )
            ),
    
            project.rooms?.map(room => {
                const isSelected = selectedRoomId === room.id;
                const pointsString = room.points.map(p => `${p.x},${p.y}`).join(' ');
                const centroid = calculatePolygonCentroid(room.points);
                const area = calculatePolygonArea(room.points);
                const areaUnit = project.units === 'mm' ? 'm' : project.units;
                const conversionFactor = project.units === 'mm' ? 1/1000000 : project.units === 'in' ? 1/144 : 1;
                const displayArea = (area * conversionFactor).toFixed(2);
    
                return (
                    React.createElement('g', { key: room.id, className: "cursor-pointer", 'data-drag-handle': `room:${room.id}` },
                        React.createElement('polygon', { points: pointsString, fill: room.color, fillOpacity: isSelected ? 0.5 : 0.3, stroke: room.color, strokeWidth: isSelected ? 3 / view.scale : 0 }),
                        React.createElement('text', { x: centroid.x, y: centroid.y, fontSize: 14 / view.scale, fill: "white", textAnchor: "middle", dominantBaseline: "middle", className: "select-none font-semibold pointer-events-none", style: { paintOrder: 'stroke', stroke: '#00000066', strokeWidth: 4 / view.scale, strokeLinejoin: 'round' } }, room.name),
                        React.createElement('text', { x: centroid.x, y: centroid.y + (18 / view.scale), fontSize: 12 / view.scale, fill: "#e2e8f0", textAnchor: "middle", dominantBaseline: "middle", className: "select-none pointer-events-none", style: { paintOrder: 'stroke', stroke: '#00000066', strokeWidth: 4 / view.scale, strokeLinejoin: 'round' } }, `${displayArea} ${areaUnit}²`)
                    )
                );
            }),
    
            project.walls.map(wall => {
                const isSelected = selectedWallId === wall.id;
                const color = isSelected ? '#22d3ee' : '#cbd5e0';
                const openings = [ ...(project.doors || []).filter(d => d.wallId === wall.id), ...(project.windows || []).filter(w => w.id === wall.id) ];
                const wallDx = wall.x2 - wall.x1; const wallDy = wall.y2 - wall.y1;
                const wallLen = Math.sqrt(wallDx * wallDx + wallDy * wallDy);
                if (openings.length === 0 || wallLen === 0) {
                    const style = wall.style || 'double';
                    if (style === 'double') {
                        const offset = wall.thickness / 2;
                        const nx = wallLen > 0 ? -wallDy / wallLen : 0; const ny = wallLen > 0 ? wallDx / wallLen : 0;
                        const p1 = { x: wall.x1 + offset * nx, y: wall.y1 + offset * ny }; const p2 = { x: wall.x2 + offset * nx, y: wall.y2 + offset * ny };
                        const p3 = { x: wall.x1 - offset * nx, y: wall.y1 - offset * ny }; const p4 = { x: wall.x2 - offset * nx, y: wall.y2 - offset * ny };
                        return React.createElement('g', { key: wall.id, stroke: color, strokeWidth: 1.5 / view.scale, strokeLinecap: "round" }, React.createElement('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }), React.createElement('line', { x1: p3.x, y1: p3.y, x2: p4.x, y2: p4.y }));
                    }
                    return React.createElement('line', { key: wall.id, x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2, stroke: color, strokeWidth: wall.thickness, strokeLinecap: "round", strokeDasharray: wall.style === 'dashed' ? `${wall.thickness * 1.5} ${wall.thickness}` : 'none' });
                }
                const ux = wallDx / wallLen; const uy = wallDy / wallLen;
                const breaks = openings.map(o => [o.offset - o.width / 2, o.offset + o.width / 2]).sort((a, b) => a[0] - b[0]);
                const segments = []; let currentDist = 0;
                for (const [breakStart, breakEnd] of breaks) {
                    if (breakStart > currentDist) { segments.push([currentDist, breakStart]); }
                    currentDist = Math.max(currentDist, breakEnd);
                }
                if (currentDist < wallLen) { segments.push([currentDist, wallLen]); }
                return (
                    React.createElement('g', { key: wall.id },
                        segments.map(([startDist, endDist], index) => {
                            if (endDist <= startDist) return null;
                            const p1 = { x: wall.x1 + startDist * ux, y: wall.y1 + startDist * uy };
                            const p2 = { x: wall.x1 + endDist * ux, y: wall.y1 + endDist * uy };
                            const style = wall.style || 'double';
                            if (style === 'double') {
                                const offset = wall.thickness / 2;
                                const wallNx = -wallDy / wallLen; const wallNy = wallDx / wallLen;
                                const s1 = { x: p1.x + offset * wallNx, y: p1.y + offset * wallNy }; const e1 = { x: p2.x + offset * wallNx, y: p2.y + offset * wallNy };
                                const s2 = { x: p1.x - offset * wallNx, y: p1.y - offset * wallNy }; const e2 = { x: p2.x - offset * wallNx, y: p2.y - offset * wallNy };
                                return React.createElement('g', { key: index, stroke: color, strokeWidth: 1.5 / view.scale, strokeLinecap: "butt" },
                                        React.createElement('line', { x1: s1.x, y1: s1.y, x2: e1.x, y2: e1.y }),
                                        React.createElement('line', { x1: s2.x, y1: s2.y, x2: e2.x, y2: e2.y })
                                    );
                            } else {
                                return React.createElement('line', { key: index, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: color, strokeWidth: wall.thickness, strokeLinecap: "butt", strokeDasharray: style === 'dashed' ? `${wall.thickness * 1.5} ${wall.thickness}` : 'none' });
                            }
                        })
                    )
                );
            }),
            project.arcs?.map(arc => {
                const isSelected = selectedArcId === arc.id;
                const color = isSelected ? '#22d3ee' : '#cbd5e0';
                if (arc.style === 'double') {
                    const offset = arc.thickness / 2;
                    const getNormal = (p1, p2) => {
                        const dx = p2.x - p1.x; const dy = p2.y - p1.y;
                        const len = Math.sqrt(dx*dx + dy*dy);
                        if (len === 0) return {nx: 0, ny: 0};
                        return {nx: -dy/len, ny: dx/len};
                    };
                    const n1 = getNormal({x: arc.x1, y: arc.y1}, {x: arc.cx, y: arc.cy});
                    const n2 = getNormal({x: arc.cx, y: arc.cy}, {x: arc.x2, y: arc.y2});
                    const avgNx = (n1.nx + n2.nx) / 2; const avgNy = (n1.ny + n2.ny) / 2;
                    const avgLen = Math.sqrt(avgNx*avgNx + avgNy*avgNy);
                    const nc = avgLen > 0 ? {nx: avgNx/avgLen, ny: avgNy/avgLen} : {nx: 0, ny: 0};
                    const d_inner = `M ${arc.x1 - offset * n1.nx} ${arc.y1 - offset * n1.ny} Q ${arc.cx - offset * nc.nx} ${arc.cy - offset * nc.ny} ${arc.x2 - offset * n2.nx} ${arc.y2 - offset * n2.ny}`;
                    const d_outer = `M ${arc.x1 + offset * n1.nx} ${arc.y1 + offset * n1.ny} Q ${arc.cx + offset * nc.nx} ${arc.cy + offset * nc.ny} ${arc.x2 + offset * n2.nx} ${arc.y2 + offset * n2.ny}`;
                    return React.createElement('g', { key: arc.id, stroke: color, strokeWidth: 1.5 / view.scale, fill: "none" }, React.createElement('path', { d: d_inner }), React.createElement('path', { d: d_outer }));
                }
                const d = `M ${arc.x1} ${arc.y1} Q ${arc.cx} ${arc.cy} ${arc.x2} ${arc.y2}`;
                return React.createElement('path', { key: arc.id, d: d, fill: "none", stroke: color, strokeWidth: arc.thickness, strokeLinecap: "round", strokeDasharray: arc.style === 'dashed' ? `${arc.thickness * 1.5} ${arc.thickness}` : 'none' });
            }),
            project.circularArcs?.map(arc => {
                const isSelected = selectedCircularArcId === arc.id;
                const color = isSelected ? '#22d3ee' : '#cbd5e0';
                if (arc.style === 'double') {
                    const offset = arc.thickness / 2;
                    const innerRadius = Math.max(0.1, arc.radius - offset);
                    const outerRadius = arc.radius + offset;
                    return React.createElement('g', { key: arc.id, stroke: color, strokeWidth: 1.5 / view.scale, fill: "none" }, React.createElement('path', { d: generateCircularArcPath({ ...arc, radius: innerRadius }) }), React.createElement('path', { d: generateCircularArcPath({ ...arc, radius: outerRadius }) }));
                }
                return React.createElement('path', { key: arc.id, d: generateCircularArcPath(arc), fill: "none", stroke: color, strokeWidth: arc.thickness, strokeLinecap: "round", strokeDasharray: arc.style === 'dashed' ? `${arc.thickness * 1.5} ${arc.thickness}` : 'none' });
            }),
            project.rectangles?.map(rect => {
                const isSelected = selectedRectangleId === rect.id;
                const color = isSelected ? '#22d3ee' : '#cbd5e0';
                if (rect.style === 'double') {
                    const offset = rect.thickness / 2;
                    const strokeWidth = 1.5 / view.scale;
                    const halfW = rect.width / 2; const halfH = rect.height / 2;
                    const createPaths = (o) => {
                        const i_halfW = halfW + o; const i_halfH = halfH + o;
                        let i_tl = Math.max(0, rect.topLeftRadius + o); let i_tr = Math.max(0, rect.topRightRadius + o);
                        let i_bl = Math.max(0, rect.bottomLeftRadius + o); let i_br = Math.max(0, rect.bottomRightRadius + o);
                        i_tl = Math.min(i_tl, Math.abs(i_halfW), Math.abs(i_halfH)); i_tr = Math.min(i_tr, Math.abs(i_halfW), Math.abs(i_halfH));
                        i_bl = Math.min(i_bl, Math.abs(i_halfW), Math.abs(i_halfH)); i_br = Math.min(i_br, Math.abs(i_halfW), Math.abs(i_halfH));
                        return {
                            top: `M ${-i_halfW + i_tl},${-i_halfH} L ${i_halfW - i_tr},${-i_halfH}`, right: `M ${i_halfW},${-i_halfH + i_tr} L ${i_halfW},${i_halfH - i_br}`,
                            bottom: `M ${i_halfW - i_br},${i_halfH} L ${-i_halfW + i_bl},${i_halfH}`, left: `M ${-i_halfW},${i_halfH - i_bl} L ${-i_halfW},${-i_halfH + i_tl}`,
                            topLeft: `M ${-i_halfW},${-i_halfH + i_tl} A ${i_tl},${i_tl} 0 0 1 ${-i_halfW + i_tl},${-i_halfH}`, topRight: `M ${i_halfW - i_tr},${-i_halfH} A ${i_tr},${i_tr} 0 0 1 ${i_halfW},${-i_halfH + i_tr}`,
                            bottomRight: `M ${i_halfW},${i_halfH - i_br} A ${i_br},${i_br} 0 0 1 ${i_halfW - i_br},${i_halfH}`, bottomLeft: `M ${-i_halfW + i_bl},${i_halfH} A ${i_bl},${i_bl} 0 0 1 ${-i_halfW},${i_halfH - i_bl}`,
                        };
                    };
                    const inner_paths = createPaths(-offset);
                    const outer_paths = createPaths(offset);
                    return (
                        React.createElement('g', { key: rect.id, transform: `translate(${rect.x} ${rect.y}) rotate(${rect.rotation})`, stroke: color, strokeWidth: strokeWidth, fill: "none", strokeLinecap: "round" },
                          React.createElement('g', null,
                            rect.showTop && React.createElement('path', { d: inner_paths.top }), rect.showRight && React.createElement('path', { d: inner_paths.right }),
                            rect.showBottom && React.createElement('path', { d: inner_paths.bottom }), rect.showLeft && React.createElement('path', { d: inner_paths.left }),
                            rect.showTop && rect.showLeft && rect.topLeftRadius - offset > 0 && React.createElement('path', { d: inner_paths.topLeft }), rect.showTop && rect.showRight && rect.topRightRadius - offset > 0 && React.createElement('path', { d: inner_paths.topRight }),
                            rect.showBottom && rect.showRight && rect.bottomRightRadius - offset > 0 && React.createElement('path', { d: inner_paths.bottomRight }), rect.showBottom && rect.showLeft && rect.bottomLeftRadius - offset > 0 && React.createElement('path', { d: inner_paths.bottomLeft })
                          ),
                          React.createElement('g', null,
                            rect.showTop && React.createElement('path', { d: outer_paths.top }), rect.showRight && React.createElement('path', { d: outer_paths.right }),
                            rect.showBottom && React.createElement('path', { d: outer_paths.bottom }), rect.showLeft && React.createElement('path', { d: outer_paths.left }),
                            rect.showTop && rect.showLeft && rect.topLeftRadius + offset > 0 && React.createElement('path', { d: outer_paths.topLeft }), rect.showTop && rect.showRight && rect.topRightRadius + offset > 0 && React.createElement('path', { d: outer_paths.topRight }),
                            rect.showBottom && rect.showRight && rect.bottomRightRadius + offset > 0 && React.createElement('path', { d: outer_paths.bottomRight }), rect.showBottom && rect.showLeft && rect.bottomLeftRadius + offset > 0 && React.createElement('path', { d: outer_paths.bottomLeft })
                          )
                        )
                    );
                }
                const strokeWidth = rect.thickness;
                const dashArray = rect.style === 'dashed' ? `${rect.thickness * 1.5} ${rect.thickness}` : 'none';
                const { width: w, height: h } = rect;
                const halfW = w / 2, halfH = h / 2;
                let tl = Math.min(Math.max(0, rect.topLeftRadius), halfW, halfH); let tr = Math.min(Math.max(0, rect.topRightRadius), halfW, halfH);
                let bl = Math.min(Math.max(0, rect.bottomLeftRadius), halfW, halfH); let br = Math.min(Math.max(0, rect.bottomRightRadius), halfW, halfH);
                const paths = {
                    top: `M ${-halfW + tl},${-halfH} L ${halfW - tr},${-halfH}`, right: `M ${halfW},${-halfH + tr} L ${halfW},${halfH - br}`,
                    bottom: `M ${halfW - br},${halfH} L ${-halfW + bl},${halfH}`, left: `M ${-halfW},${halfH - bl} L ${-halfW},${-halfH + tl}`,
                    topLeft: `M ${-halfW},${-halfH + tl} A ${tl},${tl} 0 0 1 ${-halfW + tl},${-halfH}`, topRight: `M ${halfW - tr},${-halfH} A ${tr},${tr} 0 0 1 ${halfW},${-halfH + tr}`,
                    bottomRight: `M ${halfW},${halfH - br} A ${br},${br} 0 0 1 ${halfW - br},${halfH}`,
                    bottomLeft: `M ${-halfW + bl},${halfH} A ${bl},${bl} 0 0 1 ${-halfW},${halfH - bl}`,
                };
                return (
                  React.createElement('g', { key: rect.id, transform: `translate(${rect.x} ${rect.y}) rotate(${rect.rotation})`, stroke: color, strokeWidth: strokeWidth, fill: "none", strokeLinecap: "round", strokeDasharray: dashArray },
                    rect.showTop && React.createElement('path', { d: paths.top }), rect.showRight && React.createElement('path', { d: paths.right }),
                    rect.showBottom && React.createElement('path', { d: paths.bottom }), rect.showLeft && React.createElement('path', { d: paths.left }),
                    rect.showTop && rect.showLeft && tl > 0 && React.createElement('path', { d: paths.topLeft }), rect.showTop && rect.showRight && tr > 0 && React.createElement('path', { d: paths.topRight }),
                    rect.showBottom && rect.showRight && br > 0 && React.createElement('path', { d: paths.bottomRight }), rect.showBottom && rect.showLeft && bl > 0 && React.createElement('path', { d: paths.bottomLeft })
                  )
                );
            }),
            [...(project.doors || []), ...(project.windows || [])].map(item => {
                const wall = project.walls.find(w => w.id === item.wallId);
                if (!wall) return null;
                const isDoor = 'type' in item;
                const isSelected = isDoor ? selectedDoorId === item.id : selectedWindowId === item.id;
                return React.createElement(DoorWindowRenderer, { key: item.id, item: item, wall: wall, isSelected: isSelected, viewScale: view.scale });
            }),
            project.dimensionLines?.map(line => React.createElement(DimensionLineRenderer, { key: line.id, line: line, isSelected: selectedDimensionLineId === line.id, viewScale: view.scale })),
            project.furniture?.map(f => {
                const isSelected = selectedFurnitureId === f.id;
                const dim = FURNITURE_DIMENSIONS[f.type];
                if (!dim) return null;
                return (
                    React.createElement('g', { key: f.id, transform: `translate(${f.x} ${f.y}) rotate(${f.rotation}) scale(${f.scaleX}, ${f.scaleY})` },
                      React.createElement('g', { transform: `translate(${-dim.width / 2} ${-dim.height / 2})`, className: isSelected ? 'text-cyan-400' : 'text-slate-400' },
                        React.createElement(FurnitureRenderer, { type: f.type, thickness: f.thickness / Math.sqrt(f.scaleX * f.scaleY) })
                      )
                    )
                );
            }),
            project.textLabels?.map(label => {
                const isSelected = selectedTextId === label.id;
                const color = isSelected ? '#22d3ee' : '#e2e8f0';
                return React.createElement('g', { key: label.id }, React.createElement('text', { x: label.x, y: label.y, transform: `rotate(${label.rotation} ${label.x} ${label.y})`, fontSize: label.fontSize, fill: color, textAnchor: "middle", dominantBaseline: "middle", className: "select-none", pointerEvents: "none" }, label.text));
            }),
            React.createElement('g', { 'data-export-ignore': "true" },
              selectedWall && React.createElement('g', { className: "cursor-move" }, React.createElement('circle', { cx: selectedWall.x1, cy: selectedWall.y1, r: HANDLE_RADIUS / view.scale, fill: "transparent", stroke: "white", strokeWidth: 2 / view.scale, 'data-drag-handle': `wall:${selectedWall.id}:start` }), React.createElement('circle', { cx: selectedWall.x2, cy: selectedWall.y2, r: HANDLE_RADIUS / view.scale, fill: "transparent", stroke: "white", strokeWidth: 2 / view.scale, 'data-drag-handle': `wall:${selectedWall.id}:end` })),
              selectedDimensionLine && React.createElement('g', null,
                React.createElement('circle', { cx: selectedDimensionLine.x1, cy: selectedDimensionLine.y1, r: HANDLE_RADIUS / view.scale, fill: "transparent", stroke: "white", strokeWidth: 2 / view.scale, className: "cursor-move", 'data-drag-handle': `dimension:${selectedDimensionLine.id}:start` }),
                React.createElement('circle', { cx: selectedDimensionLine.x2, cy: selectedDimensionLine.y2, r: HANDLE_RADIUS / view.scale, fill: "transparent", stroke: "white", strokeWidth: 2 / view.scale, className: "cursor-move", 'data-drag-handle': `dimension:${selectedDimensionLine.id}:end` }),
                (() => {
                  const { x1, y1, x2, y2, offset } = selectedDimensionLine;
                  const dx = x2 - x1; const dy = y2 - y1; const len = Math.sqrt(dx*dx + dy*dy);
                  const nx = len > 0 ? -dy/len : 0; const ny = len > 0 ? dx/len : 0;
                  const midX = (x1+x2)/2 + offset * nx; const midY = (y1+y2)/2 + offset * ny;
                  return React.createElement('circle', { cx: midX, cy: midY, r: HANDLE_RADIUS / view.scale, fill: "transparent", stroke: "white", strokeWidth: 2 / view.scale, className: "cursor-move", 'data-drag-handle': `dimension:${selectedDimensionLine.id}:offset` })
                })()
              ),
              selectedFurniture && FURNITURE_DIMENSIONS[selectedFurniture.type] && (() => {
                  const f = selectedFurniture;
                  const dim = FURNITURE_DIMENSIONS[f.type];
                  const invScale = 1 / view.scale;
                  const scaledHalfW = (dim.width / 2) * f.scaleX;
                  const scaledHalfH = (dim.height / 2) * f.scaleY;
                  return (
                    React.createElement('g', { transform: `translate(${f.x} ${f.y}) rotate(${f.rotation})` },
                      React.createElement('rect', { x: -scaledHalfW, y: -scaledHalfH, width: scaledHalfW * 2, height: scaledHalfH * 2, fill: "none", stroke: "#22d3ee", strokeWidth: 1.5 * invScale, strokeDasharray: `${4 * invScale} ${2 * invScale}`, pointerEvents: "none" }),
                      React.createElement('line', { x1: 0, y1: 0, x2: 0, y2: -(scaledHalfH + 10 * invScale), stroke: "#22d3ee", strokeWidth: 1.5 * invScale, strokeDasharray: `${4 * invScale} ${2 * invScale}` }),
                      React.createElement('circle', { cx: 0, cy: -(scaledHalfH + 10 * invScale), r: HANDLE_RADIUS * invScale, fill: "transparent", stroke: "white", strokeWidth: 2 * invScale, className: "cursor-alias", 'data-drag-handle': `furniture:${f.id}:rotate` }),
                      Object.entries({ tl: { sx: -1, sy: -1, c: 'cursor-nwse-resize' }, tr: { sx: 1, sy: -1, c: 'cursor-nesw-resize' }, bl: { sx: -1, sy: 1, c: 'cursor-nesw-resize' }, br: { sx: 1, sy: 1, c: 'cursor-nwse-resize' } }).map(([key, { sx, sy, c }]) => React.createElement('circle', { key: key, cx: sx * scaledHalfW, cy: sy * scaledHalfH, r: HANDLE_RADIUS * invScale, fill: "transparent", stroke: "white", strokeWidth: 2 * invScale, className: c, 'data-drag-handle': `furniture:${f.id}:scale-corner:${key}` })),
                      React.createElement('circle', { cx: 0, cy: -scaledHalfH, r: HANDLE_RADIUS * invScale, fill: "transparent", stroke: "white", strokeWidth: 2 * invScale, className: "cursor-ns-resize", 'data-drag-handle': `furniture:${f.id}:scale-side:top` }),
                      React.createElement('circle', { cx: 0, cy: scaledHalfH, r: HANDLE_RADIUS * invScale, fill: "transparent", stroke: "white", strokeWidth: 2 * invScale, className: "cursor-ns-resize", 'data-drag-handle': `furniture:${f.id}:scale-side:bottom` }),
                      React.createElement('circle', { cx: -scaledHalfW, cy: 0, r: HANDLE_RADIUS * invScale, fill: "transparent", stroke: "white", strokeWidth: 2 * invScale, className: "cursor-ew-resize", 'data-drag-handle': `furniture:${f.id}:scale-side:left` }),
                      React.createElement('circle', { cx: scaledHalfW, cy: 0, r: HANDLE_RADIUS * invScale, fill: "transparent", stroke: "white", strokeWidth: 2 * invScale, className: "cursor-ew-resize", 'data-drag-handle': `furniture:${f.id}:scale-side:right` })
                    )
                  )
              })(),
              selectedArc && React.createElement('g', null,
                React.createElement('line', { x1: selectedArc.x1, y1: selectedArc.y1, x2: selectedArc.cx, y2: selectedArc.cy, stroke: "#22d3ee", strokeWidth: 1/view.scale, strokeDasharray: `${4/view.scale} ${2/view.scale}` }),
                React.createElement('line', { x1: selectedArc.x2, y1: selectedArc.y2, x2: selectedArc.cx, y2: selectedArc.cy, stroke: "#22d3ee", strokeWidth: 1/view.scale, strokeDasharray: `${4/view.scale} ${2/view.scale}` }),
                React.createElement('circle', { cx: selectedArc.x1, cy: selectedArc.y1, r: HANDLE_RADIUS / view.scale, fill: "transparent", stroke: "white", strokeWidth: 2 / view.scale, className: "cursor-move", 'data-drag-handle': `arc:${selectedArc.id}:start` }),
                React.createElement('circle', { cx: selectedArc.x2, cy: selectedArc.y2, r: HANDLE_RADIUS / view.scale, fill: "transparent", stroke: "white", strokeWidth: 2 / view.scale, className: "cursor-move", 'data-drag-handle': `arc:${selectedArc.id}:end` }),
                React.createElement('circle', { cx: selectedArc.cx, cy: selectedArc.cy, r: (HANDLE_RADIUS-2) / view.scale, fill: "transparent", stroke: "white", strokeWidth: 2 / view.scale, className: "cursor-move", 'data-drag-handle': `arc:${selectedArc.id}:control` })
              ),
              selectedCircularArc && React.createElement('g', null,
                React.createElement('circle', { cx: selectedCircularArc.cx, cy: selectedCircularArc.cy, r: selectedCircularArc.radius, stroke: "#22d3ee", strokeWidth: 1/view.scale, strokeDasharray: `${4/view.scale} ${2/view.scale}`, fill: "none" }),
                React.createElement('circle', { cx: selectedCircularArc.cx, cy: selectedCircularArc.cy, r: HANDLE_RADIUS / view.scale, fill: "transparent", stroke: "white", strokeWidth: 2/view.scale, className: "cursor-move", 'data-drag-handle': `circular_arc:${selectedCircularArc.id}:center` }),
                [selectedCircularArc.startAngle, selectedCircularArc.endAngle].map((angle, i) => {
                    const pos = polarToCartesian(selectedCircularArc.cx, selectedCircularArc.cy, selectedCircularArc.radius, angle);
                    return React.createElement('circle', { key: i, cx: pos.x, cy: pos.y, r: HANDLE_RADIUS / view.scale, fill: "transparent", stroke: "white", strokeWidth: 2 / view.scale, className: "cursor-move", 'data-drag-handle': `circular_arc:${selectedCircularArc.id}:${i === 0 ? 'start' : 'end'}` });
                })
              ),
              selectedRectangle && React.createElement('g', { transform: `translate(${selectedRectangle.x} ${selectedRectangle.y}) rotate(${selectedRectangle.rotation})` },
                 React.createElement('rect', { x: -selectedRectangle.width/2, y: -selectedRectangle.height/2, width: selectedRectangle.width, height: selectedRectangle.height, fill: "none", stroke: "#22d3ee", strokeWidth: 1 / view.scale, strokeDasharray: `${4/view.scale} ${2/view.scale}`, pointerEvents: "none" }),
                 React.createElement('line', { x1: 0, y1: 0, x2: 0, y2: -(selectedRectangle.height/2 + 10), stroke: "#22d3ee", strokeWidth: 1.5 / view.scale, strokeDasharray: `${4 / view.scale} ${2 / view.scale}` }),
                 React.createElement('circle', { cx: 0, cy: -(selectedRectangle.height/2 + 10), r: HANDLE_RADIUS / view.scale, fill: "transparent", stroke: "white", strokeWidth: 2/view.scale, className: "cursor-alias", 'data-drag-handle': `rectangle:${selectedRectangle.id}:rotate` }),
                 [ {side: 'Top', x: 0, y: -selectedRectangle.height/2, show: selectedRectangle.showTop}, {side: 'Right', x: selectedRectangle.width/2, y: 0, show: selectedRectangle.showRight}, {side: 'Bottom', x: 0, y: selectedRectangle.height/2, show: selectedRectangle.showBottom}, {side: 'Left', x: -selectedRectangle.width/2, y: 0, show: selectedRectangle.showLeft} ].map(({side, x, y, show}) => React.createElement('circle', { key: side, cx: x, cy: y, r: (HANDLE_RADIUS - 1) / view.scale, fill: "transparent", stroke: show ? 'white' : '#64748b', strokeWidth: 2/view.scale, className: "cursor-pointer", 'data-drag-handle': `rectangle:${selectedRectangle.id}:edge-${side}` }))
              )
            ),
            React.createElement('g', { 'data-export-ignore': "true", opacity: 0.7 },
                hoveredRoomPolygon && React.createElement('polygon', { points: hoveredRoomPolygon.points.map(p => `${p.x},${p.y}`).join(' '), fill: "#38bdf8", fillOpacity: 0.5, stroke: "#38bdf8", strokeWidth: 2 / view.scale, strokeDasharray: `${4 / view.scale} ${2 / view.scale}`, pointerEvents: "none" }),
                drawingState?.preview && drawingState.preview.wall && React.createElement(DoorWindowRenderer, { item: drawingState.preview.item, wall: drawingState.preview.wall, isSelected: true, viewScale: view.scale }),
                drawingState?.type === 'furniture_preview' && drawingState.preview && (() => {
                    const { type, x, y, scaleX, scaleY, thickness } = drawingState.preview;
                    const dim = FURNITURE_DIMENSIONS[type];
                    if (!dim) return null;
                    const sX = scaleX ?? 1;
                    const sY = scaleY ?? 1;
                    return (
                        React.createElement('g', { transform: `translate(${x} ${y}) scale(${sX}, ${sY})`, pointerEvents: "none" },
                            React.createElement('g', { transform: `translate(${-dim.width / 2} ${-dim.height / 2})`, className: "text-cyan-400 opacity-75" },
                                React.createElement(FurnitureRenderer, { type: type, thickness: (thickness ?? 2) / Math.sqrt(sX * sY) })
                            )
                        )
                    );
                })(),
                drawingState?.type === 'wall' && drawingState.start && drawingState.current && (() => {
                    const { start, current } = drawingState;
                    const strokeColor = "#22d3ee";
                    const thickness = 10;
                    if (wallStyle === 'double') {
                      const dx = current.x - start.x; const dy = current.y - start.y; const len = Math.sqrt(dx*dx + dy*dy);
                      if (len > 0) {
                        const offset = thickness / 2; const nx = -dy / len; const ny = dx / len;
                        const p1 = {x: start.x + offset*nx, y: start.y + offset*ny}, p2 = {x: current.x + offset*nx, y: current.y + offset*ny};
                        const p3 = {x: start.x - offset*nx, y: start.y - offset*ny}, p4 = {x: current.x - offset*nx, y: current.y - offset*ny};
                        return React.createElement('g', { stroke: strokeColor, strokeWidth: 2/view.scale }, React.createElement('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }), React.createElement('line', { x1: p3.x, y1: p3.y, x2: p4.x, y2: p4.y }));
                      }
                    } else {
                        return React.createElement('line', { x1: start.x, y1: start.y, x2: current.x, y2: current.y, stroke: strokeColor, strokeWidth: thickness, strokeDasharray: wallStyle === 'dashed' ? `${thickness * 1.5} ${thickness}` : 'none', strokeLinecap: "round" });
                    }
                  return null;
                })(),
                drawingState?.type === 'wall_rectangle' && drawingState.start && drawingState.current && (() => {
                    const { start, current } = drawingState;
                    const strokeColor = "#22d3ee";
                    const thickness = 10;
                    const p1 = { x: start.x, y: start.y }; const p2 = { x: current.x, y: start.y }; const p3 = { x: current.x, y: current.y }; const p4 = { x: start.x, y: current.y };
                    const walls = [ {s: p1, e: p2}, {s: p2, e: p3}, {s: p3, e: p4}, {s: p4, e: p1} ];
                    if (wallStyle === 'double') {
                        return React.createElement('g', { stroke: strokeColor, strokeWidth: 2 / view.scale }, walls.map(({s, e}, i) => {
                            const dx = e.x - s.x; const dy = e.y - s.y; const len = Math.sqrt(dx*dx + dy*dy);
                            if (len > 0) {
                                const offset = thickness / 2; const nx = -dy / len; const ny = dx / len;
                                const p1 = {x: s.x + offset*nx, y: s.y + offset*ny}, p2 = {x: e.x + offset*nx, y: e.y + offset*ny};
                                const p3 = {x: s.x - offset*nx, y: s.y - offset*ny}, p4 = {x: e.x - offset*nx, y: e.y - offset*ny};
                                return React.createElement('g', { key: i }, React.createElement('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }), React.createElement('line', { x1: p3.x, y1: p3.y, x2: p4.x, y2: p4.y }));
                            }
                            return null;
                        }));
                    } else {
                        return React.createElement('g', null, walls.map(({s, e}, i) => React.createElement('line', { key: i, x1: s.x, y1: s.y, x2: e.x, y2: e.y, stroke: strokeColor, strokeWidth: thickness, strokeDasharray: wallStyle === 'dashed' ? `${thickness * 1.5} ${thickness}` : 'none', strokeLinecap: "round" })));
                    }
                })(),
                drawingState?.type === 'arc' && drawingState.start && drawingState.current && (() => {
                    const { start, current } = drawingState; const thickness = 5;
                     if (arcStyle === 'double') {
                         const dx = current.x - start.x; const dy = current.y - start.y; const len = Math.sqrt(dx*dx + dy*dy);
                         if (len > 0) {
                             const offset = thickness / 2; const nx = -dy / len; const ny = dx / len;
                             const p1 = {x: start.x + offset*nx, y: start.y + offset*ny}, p2 = {x: current.x + offset*nx, y: current.y + offset*ny};
                             const p3 = {x: start.x - offset*nx, y: start.y - offset*ny}, p4 = {x: current.x - offset*nx, y: current.y - offset*ny};
                             return React.createElement('g', { stroke: "#22d3ee", strokeWidth: 2/view.scale }, React.createElement('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }), React.createElement('line', { x1: p3.x, y1: p3.y, x2: p4.x, y2: p4.y }));
                         }
                     } else {
                         return React.createElement('line', { x1: start.x, y1: start.y, x2: current.x, y2: current.y, stroke: "#22d3ee", strokeWidth: thickness, strokeDasharray: arcStyle === 'dashed' ? `${thickness * 1.5} ${thickness}` : 'none', strokeLinecap: "round" });
                     }
                     return null;
                })(),
                drawingState?.type === 'circular_arc' && drawingState.start && drawingState.current && (() => {
                    const { start, current } = drawingState;
                    const radius = Math.sqrt((current.x - start.x)**2 + (current.y - start.y)**2); const thickness = 5;
                    if (arcStyle === 'double') {
                          const offset = thickness / 2; const innerRadius = Math.max(0.1, radius - offset); const outerRadius = radius + offset;
                          return React.createElement('g', { stroke: "#22d3ee", strokeWidth: 2/view.scale, fill: "none" }, React.createElement('circle', { cx: start.x, cy: start.y, r: innerRadius }), React.createElement('circle', { cx: start.x, cy: start.y, r: outerRadius }));
                    } else {
                          return React.createElement('circle', { cx: start.x, cy: start.y, r: radius, stroke: "#22d3ee", strokeWidth: thickness, fill: "none", strokeDasharray: arcStyle === 'dashed' ? `${thickness * 1.5} ${thickness}` : 'none' });
                    }
                })(),
                drawingState?.type === 'rectangle' && drawingState.start && drawingState.current && (() => {
                    const { start, current } = drawingState;
                    const width = Math.abs(start.x - current.x); const height = Math.abs(start.y - current.y); const x = Math.min(start.x, current.x); const y = Math.min(start.y, current.y); const thickness = 5;
                    if (rectangleStyle === 'double') {
                        const offset = thickness / 2;
                        return React.createElement('g', { stroke: "#22d3ee", strokeWidth: 1.5 / view.scale, fill: "none" }, React.createElement('rect', { x: x - offset, y: y - offset, width: width + 2 * offset, height: height + 2 * offset }), React.createElement('rect', { x: x + offset, y: y + offset, width: Math.max(0, width - 2 * offset), height: Math.max(0, height - 2 * offset) }));
                    }
                    const dashArray = rectangleStyle === 'dashed' ? `${6 / view.scale} ${3 / view.scale}` : 'none';
                    return React.createElement('rect', { x: x, y: y, width: width, height: height, stroke: "#22d3ee", strokeWidth: 1.5 / view.scale, fill: "none", strokeDasharray: dashArray });
                })(),
                drawingState?.type === 'dimension' && drawingState.start && drawingState.current && (() => {
                     if(drawingState.step === 1) { return React.createElement('line', { x1: drawingState.start.x, y1: drawingState.start.y, x2: drawingState.current.x, y2: drawingState.current.y, stroke: "#a78bfa", strokeWidth: 1/view.scale, strokeDasharray: `${4/view.scale} ${2/view.scale}` }); }
                     if(drawingState.step === 2) {
                        const end = drawingState.end; const dx = end.x - drawingState.start.x; const dy = end.y - drawingState.start.y; const len = Math.sqrt(dx*dx + dy*dy);
                        if (len === 0) return null;
                        const nx = -dy/len; const ny = dx/len;
                        const p_dx = drawingState.current.x - drawingState.start.x; const p_dy = drawingState.current.y - drawingState.start.y;
                        const offset = p_dx * nx + p_dy * ny;
                        const previewLine = {id: 'preview', x1: drawingState.start.x, y1: drawingState.start.y, x2: end.x, y2: end.y, offset};
                        return React.createElement('g', null, React.createElement(DimensionLineRenderer, {line: previewLine, isSelected: true, viewScale: view.scale}));
                     }
                    return null;
                })()
              )
          )
        )
      );
    };

    // --- End of components/Canvas.tsx ---

    // --- Start of App.tsx ---
    const App = () => {
        const [project, setProject] = useState(null);
        const [history, setHistory] = useState([]);
        const [historyIndex, setHistoryIndex] = useState(-1);
        const fileInputRef = useRef(null);
        const traceFileInputRef = useRef(null);
        const svgRef = useRef(null);
        const canvasContainerRef = useRef(null);
        const fileMenuRef = useRef(null);
        const exportMenuRef = useRef(null);
        const furniturePanelRef = useRef(null);
        const [view, setView] = useState({ scale: 1, offsetX: 0, offsetY: 0 });
        const [isPanning, setIsPanning] = useState(false);
        const [panStart, setPanStart] = useState({ x: 0, y: 0 });
        const [mode, setMode] = useState('select');
        const [isInspectorOpen, setIsInspectorOpen] = useState(true);
        const [isFurniturePanelOpen, setIsFurniturePanelOpen] = useState(false);
        const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
        const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
        const [wallStyle, setWallStyle] = useState('double');
        const [arcStyle, setArcStyle] = useState('single');
        const [rectangleStyle, setRectangleStyle] = useState('single');
        const [doorType, setDoorType] = useState('single');
        const [selectedWallId, setSelectedWallId] = useState(null);
        const [selectedRoomId, setSelectedRoomId] = useState(null);
        const [selectedTextId, setSelectedTextId] = useState(null);
        const [selectedFurnitureId, setSelectedFurnitureId] = useState(null);
        const [selectedArcId, setSelectedArcId] = useState(null);
        const [selectedCircularArcId, setSelectedCircularArcId] = useState(null);
        const [selectedRectangleId, setSelectedRectangleId] = useState(null);
        const [selectedDimensionLineId, setSelectedDimensionLineId] = useState(null);
        const [selectedDoorId, setSelectedDoorId] = useState(null);
        const [selectedWindowId, setSelectedWindowId] = useState(null);
        const [cursorWorldPos, setCursorWorldPos] = useState(null);
        const [showGrid, setShowGrid] = useState(true);
        const [showOriginAxes, setShowOriginAxes] = useState(true);
        const [placingFurnitureType, setPlacingFurnitureType] = useState(null);
        const [traceImage, setTraceImage] = useState(null);
        const [drawingState, setDrawingState] = useState(null);
        const [hoveredRoomPolygon, setHoveredRoomPolygon] = useState(null);
        const [dragAction, setDragAction] = useState(null);
        const [lengthInputValue, setLengthInputValue] = useState("");
        const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
        const [pdfOptions, setPdfOptions] = useState({
            paperSize: 'a4',
            orientation: 'l',
            projectName: '',
            designer: '',
            date: new Date().toLocaleDateString(),
        });

        const handlePdfOptionChange = (e) => {
            const { name, value } = e.target;
            setPdfOptions(prev => ({ ...prev, [name]: value }));
        };

        const openPdfModal = () => {
            setPdfOptions(prev => ({
                ...prev,
                projectName: project?.projectName || 'Untitled Project',
                date: new Date().toLocaleDateString(),
            }));
            setIsPdfModalOpen(true);
            setIsExportMenuOpen(false);
        }

        const selectedItemExists = useMemo(() => {
            return !!(selectedWallId || selectedRoomId || selectedTextId || selectedFurnitureId || selectedArcId || selectedCircularArcId || selectedRectangleId || selectedDimensionLineId || selectedDoorId || selectedWindowId);
        }, [selectedWallId, selectedRoomId, selectedTextId, selectedFurnitureId, selectedArcId, selectedCircularArcId, selectedRectangleId, selectedDimensionLineId, selectedDoorId, selectedWindowId]);

        useEffect(() => {
            if (selectedItemExists) {
                setIsInspectorOpen(true);
            }
        }, [selectedItemExists]);

        const pinchStateRef = useRef(null);
        const touchMovedRef = useRef(false);
        const SNAP_DISTANCE = 10;
        const SELECTION_THRESHOLD = 15;
        const TEXT_SELECTION_RADIUS = 20;

        const updateProject = useCallback((updater, description) => {
            setProject(prevProject => {
                if (!prevProject) return null;
                const newProject = updater(prevProject);
                if (!newProject) return prevProject;
                const newHistory = history.slice(0, historyIndex + 1);
                newHistory.push(newProject);
                setHistory(newHistory);
                setHistoryIndex(newHistory.length - 1);
                return newProject;
            });
        }, [history, historyIndex]);

        const commitDragToHistory = (description) => {
            updateProject(p => ({ ...p }), description);
        };

        const undo = useCallback(() => {
            if (historyIndex > 0) {
                const newIndex = historyIndex - 1;
                setHistoryIndex(newIndex);
                setProject(history[newIndex]);
                clearSelection();
            }
        }, [history, historyIndex]);

        const redo = useCallback(() => {
            if (historyIndex < history.length - 1) {
                const newIndex = historyIndex + 1;
                setHistoryIndex(newIndex);
                setProject(history[newIndex]);
                clearSelection();
            }
        }, [history, historyIndex]);

        const selectedWall = project?.walls.find(w => w.id === selectedWallId);
        const selectedRoom = project?.rooms?.find(r => r.id === selectedRoomId);
        const selectedText = project?.textLabels?.find(t => t.id === selectedTextId);
        const selectedFurniture = project?.furniture?.find(f => f.id === selectedFurnitureId);
        const selectedArc = project?.arcs?.find(a => a.id === selectedArcId);
        const selectedCircularArc = project?.circularArcs?.find(a => a.id === selectedCircularArcId);
        const selectedRectangle = project?.rectangles?.find(r => r.id === selectedRectangleId);
        const selectedDimensionLine = project?.dimensionLines?.find(d => d.id === selectedDimensionLineId);
        const selectedDoor = project?.doors?.find(d => d.id === selectedDoorId);
        const selectedWindow = project?.windows?.find(w => w.id === selectedWindowId);
        const updateSelectedWall = useCallback((prop, value) => {
            if (!selectedWallId) return;
            updateProject(p => {
                if (!p) return null;
                const wallIndex = p.walls.findIndex(w => w.id === selectedWallId);
                if (wallIndex === -1) return p;
                const newWalls = [...p.walls];
                newWalls[wallIndex] = { ...newWalls[wallIndex], [prop]: value };
                const newRooms = (p.rooms || []).map(room => {
                    const centroid = calculatePolygonCentroid(room.points);
                    const newPolygon = findRoomFromPoint(centroid, newWalls, []);
                    return newPolygon ? { ...room, points: newPolygon.points } : null;
                }).filter((r) => r !== null);
                return { ...p, walls: newWalls, rooms: newRooms };
            }, `Update Wall ${String(prop)}`);
        }, [selectedWallId, updateProject]);
        const updateSelectedWallLength = useCallback((newLength) => {
            if (!selectedWall) return;
            const { x1, y1, x2, y2 } = selectedWall;
            const currentLength = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
            if (currentLength === 0) return;
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const newX2 = x1 + newLength * Math.cos(angle);
            const newY2 = y1 + newLength * Math.sin(angle);
            updateProject(p => {
                if (!p) return null;
                const wallIndex = p.walls.findIndex(w => w.id === selectedWallId);
                if (wallIndex === -1) return p;
                const newWalls = [...p.walls];
                newWalls[wallIndex] = { ...newWalls[wallIndex], x2: newX2, y2: newY2 };
                const newRooms = (p.rooms || []).map(room => {
                    const centroid = calculatePolygonCentroid(room.points);
                    const newPolygon = findRoomFromPoint(centroid, newWalls, []);
                    return newPolygon ? { ...room, points: newPolygon.points } : null;
                }).filter((r) => r !== null);
                return { ...p, walls: newWalls, rooms: newRooms };
            }, "Update Wall Length");
        }, [selectedWall, selectedWallId, updateProject]);
        const deleteSelectedItem = useCallback(() => {
            let itemType = null;
            let itemId = null;
            let typeName = '';
            if (selectedWallId) { itemType = 'walls'; itemId = selectedWallId; typeName = 'Wall'; }
            else if (selectedRoomId) { itemType = 'rooms'; itemId = selectedRoomId; typeName = 'Room'; }
            else if (selectedTextId) { itemType = 'textLabels'; itemId = selectedTextId; typeName = 'Text'; }
            else if (selectedFurnitureId) { itemType = 'furniture'; itemId = selectedFurnitureId; typeName = 'Furniture'; }
            else if (selectedArcId) { itemType = 'arcs'; itemId = selectedArcId; typeName = 'Arc'; }
            else if (selectedCircularArcId) { itemType = 'circularArcs'; itemId = selectedCircularArcId; typeName = 'Circular Arc'; }
            else if (selectedRectangleId) { itemType = 'rectangles'; itemId = selectedRectangleId; typeName = 'Rectangle'; }
            else if (selectedDimensionLineId) { itemType = 'dimensionLines'; itemId = selectedDimensionLineId; typeName = 'Dimension Line'; }
            else if (selectedDoorId) { itemType = 'doors'; itemId = selectedDoorId; typeName = 'Door'; }
            else if (selectedWindowId) { itemType = 'windows'; itemId = selectedWindowId; typeName = 'Window'; }
            if (!itemType || !itemId) return;
            const finalItemId = itemId;
            const finalItemType = itemType;
            updateProject(p => {
                if (!p) return null;
                const items = p[finalItemType];
                if (!items) return p;
                return {
                    ...p,
                    [finalItemType]: items.filter(item => item.id !== finalItemId)
                };
            }, `Delete ${typeName}`);
            clearSelection();
        }, [selectedWallId, selectedRoomId, selectedTextId, selectedFurnitureId, selectedArcId, selectedCircularArcId, selectedRectangleId, selectedDimensionLineId, selectedDoorId, selectedWindowId, updateProject]);
        const duplicateSelectedWall = useCallback(() => {
            if (!selectedWall) return;
            const newWall = { ...selectedWall, id: `w_${crypto.randomUUID()}`, x1: selectedWall.x1 + 10, y1: selectedWall.y1 + 10, x2: selectedWall.x2 + 10, y2: selectedWall.y2 + 10 };
            updateProject(p => ({ ...p, walls: [...p.walls, newWall] }), "Duplicate Wall");
            clearSelection('wall');
            setSelectedWallId(newWall.id);
        }, [selectedWall, updateProject]);
        const updateSelectedRoom = useCallback((prop, value) => {
            if (!selectedRoomId) return;
            updateProject(p => {
                if (!p) return null;
                const items = (p.rooms || []);
                const itemIndex = items.findIndex(item => item.id === selectedRoomId);
                if (itemIndex === -1) return p;
                const newItems = [...items];
                newItems[itemIndex] = { ...newItems[itemIndex], [prop]: value };
                return { ...p, rooms: newItems };
            }, `Update Room ${String(prop)}`);
        }, [selectedRoomId, updateProject]);
        const duplicateSelectedRoom = useCallback(() => {
            if (!selectedRoom) return;
            const newRoom = { ...selectedRoom, id: `room_${crypto.randomUUID()}`, points: selectedRoom.points.map(p => ({ x: p.x + 10, y: p.y + 10 })) };
            updateProject(p => ({ ...p, rooms: [...(p.rooms || []), newRoom] }), "Duplicate Room");
            clearSelection('room');
            setSelectedRoomId(newRoom.id);
        }, [selectedRoom, updateProject]);
        const updateSelectedText = useCallback((prop, value) => {
            if (!selectedTextId) return;
            updateProject(p => {
                if (!p) return null;
                const items = (p.textLabels || []);
                const itemIndex = items.findIndex(item => item.id === selectedTextId);
                if (itemIndex === -1) return p;
                const newItems = [...items];
                newItems[itemIndex] = { ...newItems[itemIndex], [prop]: value };
                return { ...p, textLabels: newItems };
            }, `Update Text ${String(prop)}`);
        }, [selectedTextId, updateProject]);
        const duplicateSelectedText = useCallback(() => {
            if (!selectedText) return;
            const newText = { ...selectedText, id: `t_${crypto.randomUUID()}`, x: selectedText.x + 10, y: selectedText.y + 10 };
            updateProject(p => ({ ...p, textLabels: [...(p.textLabels || []), newText] }), "Duplicate Text");
            clearSelection('text');
            setSelectedTextId(newText.id);
        }, [selectedText, updateProject]);
        const updateSelectedFurniture = useCallback((prop, value) => {
            if (!selectedFurnitureId) return;
            updateProject(p => {
                if (!p) return null;
                const items = (p.furniture || []);
                const itemIndex = items.findIndex(item => item.id === selectedFurnitureId);
                if (itemIndex === -1) return p;
                const newItems = [...items];
                newItems[itemIndex] = { ...newItems[itemIndex], [prop]: value };
                return { ...p, furniture: newItems };
            }, `Update Furniture ${String(prop)}`);
        }, [selectedFurnitureId, updateProject]);
        const duplicateSelectedFurniture = useCallback(() => {
            if (!selectedFurniture) return;
            const newFurniture = { ...selectedFurniture, id: `f_${crypto.randomUUID()}`, x: selectedFurniture.x + 10, y: selectedFurniture.y + 10 };
            updateProject(p => ({ ...p, furniture: [...(p.furniture || []), newFurniture] }), "Duplicate Furniture");
            clearSelection('furniture');
            setSelectedFurnitureId(newFurniture.id);
        }, [selectedFurniture, updateProject]);
        const updateSelectedArc = useCallback((prop, value) => {
            if (!selectedArcId) return;
            updateProject(p => {
                if (!p) return null;
                const items = (p.arcs || []);
                const itemIndex = items.findIndex(item => item.id === selectedArcId);
                if (itemIndex === -1) return p;
                const newItems = [...items];
                newItems[itemIndex] = { ...newItems[itemIndex], [prop]: value };
                return { ...p, arcs: newItems };
            }, `Update Arc ${String(prop)}`);
        }, [selectedArcId, updateProject]);
        const duplicateSelectedArc = useCallback(() => {
            if (!selectedArc) return;
            const newArc = { ...selectedArc, id: `a_${crypto.randomUUID()}`, x1: selectedArc.x1 + 10, y1: selectedArc.y1 + 10, x2: selectedArc.x2 + 10, y2: selectedArc.y2 + 10, cx: selectedArc.cx + 10, cy: selectedArc.cy + 10 };
            updateProject(p => ({ ...p, arcs: [...(p.arcs || []), newArc] }), "Duplicate Arc");
            clearSelection('arc');
            setSelectedArcId(newArc.id);
        }, [selectedArc, updateProject]);
        const updateSelectedCircularArc = useCallback((prop, value) => {
            if (!selectedCircularArcId) return;
            updateProject(p => {
                if (!p) return null;
                const items = (p.circularArcs || []);
                const itemIndex = items.findIndex(item => item.id === selectedCircularArcId);
                if (itemIndex === -1) return p;
                const newItems = [...items];
                newItems[itemIndex] = { ...newItems[itemIndex], [prop]: value };
                return { ...p, circularArcs: newItems };
            }, `Update Circular Arc ${String(prop)}`);
        }, [selectedCircularArcId, updateProject]);
        const duplicateSelectedCircularArc = useCallback(() => {
            if (!selectedCircularArc) return;
            const newArc = { ...selectedCircularArc, id: `ca_${crypto.randomUUID()}`, cx: selectedCircularArc.cx + 10, cy: selectedCircularArc.cy + 10 };
            updateProject(p => ({ ...p, circularArcs: [...(p.circularArcs || []), newArc] }), "Duplicate Circular Arc");
            clearSelection('circular_arc');
            setSelectedCircularArcId(newArc.id);
        }, [selectedCircularArc, updateProject]);
        const updateSelectedRectangle = useCallback((prop, value) => {
            if (!selectedRectangleId) return;
            updateProject(p => {
                if (!p) return null;
                const items = (p.rectangles || []);
                const itemIndex = items.findIndex(item => item.id === selectedRectangleId);
                if (itemIndex === -1) return p;
                const newItems = [...items];
                newItems[itemIndex] = { ...newItems[itemIndex], [prop]: value };
                return { ...p, rectangles: newItems };
            }, `Update Rectangle ${String(prop)}`);
        }, [selectedRectangleId, updateProject]);
        const duplicateSelectedRectangle = useCallback(() => {
            if (!selectedRectangle) return;
            const newRect = { ...selectedRectangle, id: `r_${crypto.randomUUID()}`, x: selectedRectangle.x + 10, y: selectedRectangle.y + 10 };
            updateProject(p => ({ ...p, rectangles: [...(p.rectangles || []), newRect] }), "Duplicate Rectangle");
            clearSelection('rectangle');
            setSelectedRectangleId(newRect.id);
        }, [selectedRectangle, updateProject]);
        const updateSelectedDimensionLine = useCallback((prop, value) => {
            if (!selectedDimensionLineId) return;
            updateProject(p => {
                if (!p) return null;
                const items = (p.dimensionLines || []);
                const itemIndex = items.findIndex(item => item.id === selectedDimensionLineId);
                if (itemIndex === -1) return p;
                const newItems = [...items];
                newItems[itemIndex] = { ...newItems[itemIndex], [prop]: value };
                return { ...p, dimensionLines: newItems };
            }, `Update Dimension Line ${String(prop)}`);
        }, [selectedDimensionLineId, updateProject]);
        const updateSelectedDimensionLineLength = useCallback((newLength) => {
            if (!selectedDimensionLine) return;
            const { x1, y1, x2, y2 } = selectedDimensionLine;
            const currentLength = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
            if (currentLength === 0) return;
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const newX2 = x1 + newLength * Math.cos(angle);
            const newY2 = y1 + newLength * Math.sin(angle);
            updateProject(p => {
                if (!p) return null;
                const items = (p.dimensionLines || []);
                const itemIndex = items.findIndex(item => item.id === selectedDimensionLineId);
                if (itemIndex === -1) return p;
                const newItems = [...items];
                newItems[itemIndex] = { ...newItems[itemIndex], x2: newX2, y2: newY2 };
                return { ...p, dimensionLines: newItems };
            }, "Update Dimension Length");
        }, [selectedDimensionLine, selectedDimensionLineId, updateProject]);
        const duplicateSelectedDimensionLine = useCallback(() => {
            if (!selectedDimensionLine) return;
            const newLine = { ...selectedDimensionLine, id: `dl_${crypto.randomUUID()}`, x1: selectedDimensionLine.x1 + 10, y1: selectedDimensionLine.y1 + 10, x2: selectedDimensionLine.x2 + 10, y2: selectedDimensionLine.y2 + 10 };
            updateProject(p => ({ ...p, dimensionLines: [...(p.dimensionLines || []), newLine] }), "Duplicate Dimension Line");
            clearSelection('dimension_line');
            setSelectedDimensionLineId(newLine.id);
        }, [selectedDimensionLine, updateProject]);
        const updateSelectedDoor = useCallback((prop, value) => {
            if (!selectedDoorId) return;
            updateProject(p => {
                if (!p) return null;
                const items = (p.doors || []);
                const itemIndex = items.findIndex(item => item.id === selectedDoorId);
                if (itemIndex === -1) return p;
                const newItems = [...items];
                newItems[itemIndex] = { ...newItems[itemIndex], [prop]: value };
                return { ...p, doors: newItems };
            }, `Update Door ${String(prop)}`);
        }, [selectedDoorId, updateProject]);
        const duplicateSelectedDoor = useCallback(() => {
            if (!selectedDoor) return;
            const newDoor = { ...selectedDoor, id: `d_${crypto.randomUUID()}`, offset: selectedDoor.offset + 10 };
            updateProject(p => ({ ...p, doors: [...(p.doors || []), newDoor] }), "Duplicate Door");
            clearSelection('door');
            setSelectedDoorId(newDoor.id);
        }, [selectedDoor, updateProject]);
        const updateSelectedWindow = useCallback((prop, value) => {
            if (!selectedWindowId) return;
            updateProject(p => {
                if (!p) return null;
                const items = (p.windows || []);
                const itemIndex = items.findIndex(item => item.id === selectedWindowId);
                if (itemIndex === -1) return p;
                const newItems = [...items];
                newItems[itemIndex] = { ...newItems[itemIndex], [prop]: value };
                return { ...p, windows: newItems };
            }, `Update Window ${String(prop)}`);
        }, [selectedWindowId, updateProject]);
        const duplicateSelectedWindow = useCallback(() => {
            if (!selectedWindow) return;
            const newWindow = { ...selectedWindow, id: `win_${crypto.randomUUID()}`, offset: selectedWindow.offset + 10 };
            updateProject(p => ({ ...p, windows: [...(p.windows || []), newWindow] }), "Duplicate Window");
            clearSelection('window');
            setSelectedWindowId(newWindow.id);
        }, [selectedWindow, updateProject]);
        const clearSelection = (keepType = null) => {
            if(keepType !== 'furniture') setSelectedFurnitureId(null);
            if(keepType !== 'wall') setSelectedWallId(null);
            if(keepType !== 'text') setSelectedTextId(null);
            if(keepType !== 'arc') setSelectedArcId(null);
            if(keepType !== 'circular_arc') setSelectedCircularArcId(null);
            if(keepType !== 'rectangle') setSelectedRectangleId(null);
            if(keepType !== 'dimension_line') setSelectedDimensionLineId(null);
            if(keepType !== 'door') setSelectedDoorId(null);
            if(keepType !== 'window') setSelectedWindowId(null);
            if(keepType !== 'room') setSelectedRoomId(null);
        };

        const createNewProject = useCallback(() => {
            const newProject = {
                projectId: `proj_${crypto.randomUUID()}`,
                projectName: 'Untitled Project',
                units: Units.MM,
                walls: [], rooms: [], furniture: [], textLabels: [], arcs: [],
                circularArcs: [], rectangles: [], dimensionLines: [], doors: [], windows: [],
            };
            setProject(newProject);
            setHistory([newProject]);
            setHistoryIndex(0);
            clearSelection();
            setMode('select');
            setTraceImage(null);
            setIsFileMenuOpen(false);
        }, []);

        const saveProject = useCallback(() => {
            if (!project) return;
            const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${project.projectName.replace(/\s+/g, '_') || 'floorplan'}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
            a.remove();
            setIsFileMenuOpen(false);
        }, [project]);

        const openProject = useCallback(() => {
            fileInputRef.current?.click();
            setIsFileMenuOpen(false);
        }, []);

        const exportProject = useCallback(() => {
            if (!project || !svgRef.current) {
                alert("No active project to export.");
                return;
            }
            setIsExportMenuOpen(false);
            setTimeout(() => {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                const hasContent = project.walls.length > 0 || project.textLabels.length > 0 || project.furniture.length > 0 || project.arcs.length > 0 || project.rectangles.length > 0 || project.circularArcs.length > 0 || project.dimensionLines.length > 0 || project.doors.length > 0 || project.windows.length > 0 || project.rooms.length > 0;
                if (!hasContent) { minX = -10000; maxX = 10000; minY = -10000; maxY = 10000; } // Tăng/giảm để zoom out/in
                else {
                    const updateBoundsWithPoint = (p) => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); };
                    project.walls.forEach(w => { updateBoundsWithPoint({x: w.x1, y: w.y1}); updateBoundsWithPoint({x: w.x2, y: w.y2}); });
                    project.rooms.forEach(r => r.points.forEach(updateBoundsWithPoint));
                    project.textLabels.forEach(t => { updateBoundsWithPoint({x: t.x - t.fontSize, y: t.y - t.fontSize}); updateBoundsWithPoint({x: t.x + t.fontSize, y: t.y + t.fontSize}); });
                    project.furniture.forEach(f => {
                        const dim = FURNITURE_DIMENSIONS[f.type]; if(!dim) return;
                        const angle = f.rotation * Math.PI / 180; const w = dim.width * f.scaleX / 2; const h = dim.height * f.scaleY / 2;
                        const corners = [ {x: -w, y: -h}, {x: w, y: -h}, {x: w, y: h}, {x: -w, y: h} ];
                        corners.forEach(c => {
                            const rotX = f.x + c.x * Math.cos(angle) - c.y * Math.sin(angle);
                            const rotY = f.y + c.x * Math.sin(angle) + c.y * Math.cos(angle);
                            updateBoundsWithPoint({x: rotX, y: rotY});
                        });
                    });
                    project.arcs.forEach(a => { updateBoundsWithPoint({x: a.x1, y: a.y1}); updateBoundsWithPoint({x: a.x2, y: a.y2}); updateBoundsWithPoint({x: a.cx, y: a.cy}); });
                    project.circularArcs.forEach(a => { updateBoundsWithPoint({x: a.cx - a.radius, y: a.cy - a.radius}); updateBoundsWithPoint({x: a.cx + a.radius, y: a.cy + a.radius}); });
                    project.rectangles.forEach(r => { updateBoundsWithPoint({x: r.x - r.width/2, y: r.y - r.height/2}); updateBoundsWithPoint({x: r.x + r.width/2, y: r.y + r.height/2}); });
                    project.dimensionLines.forEach(line => {
                        const { x1, y1, x2, y2, offset } = line;
                        const dx = x2 - x1; const dy = y2 - y1; const len = Math.sqrt(dx * dx + dy * dy); if (len === 0) return;
                        const nx = -dy / len; const ny = dx / len; const extension = 12;
                        const p1_off = { x: x1 + offset * nx, y: y1 + offset * ny }; const p2_off = { x: x2 + offset * nx, y: y2 + offset * ny };
                        const p1_ext_end = { x: p1_off.x + nx * extension, y: p1_off.y + ny * extension }; const p2_ext_end = { x: p2_off.x + nx * extension, y: p2_off.y + ny * extension };
                        updateBoundsWithPoint({x: x1, y: y1}); updateBoundsWithPoint({x: x2, y: y2});
                        updateBoundsWithPoint(p1_ext_end); updateBoundsWithPoint(p2_ext_end);
                    });
                    const toWorld = (localX, localY, angleRad, cX, cY) => ({ x: cX + localX * Math.cos(angleRad) - localY * Math.sin(angleRad), y: cY + localX * Math.sin(angleRad) + localY * Math.cos(angleRad) });
                    const checkArcExtremities = (hingePos, leafWidth, closedTipPos, openTipPos) => {
                        let startAngleDeg = Math.atan2(closedTipPos.y - hingePos.y, closedTipPos.x - hingePos.x) * 180 / Math.PI;
                        let endAngleDeg = Math.atan2(openTipPos.y - hingePos.y, openTipPos.x - hingePos.x) * 180 / Math.PI;
                        if (startAngleDeg < 0) startAngleDeg += 360; if (endAngleDeg < 0) endAngleDeg += 360;
                        if (Math.abs(startAngleDeg - endAngleDeg) > 180) { if (startAngleDeg > endAngleDeg) endAngleDeg += 360; else startAngleDeg += 360; }
                        const minAngle = Math.min(startAngleDeg, endAngleDeg); const maxAngle = Math.max(startAngleDeg, endAngleDeg);
                        for (const cardinal of [0, 90, 180, 270, 360, 450, 540, 630]) {
                            if (cardinal > minAngle && cardinal < maxAngle) {
                                const rad = cardinal * Math.PI / 180;
                                updateBoundsWithPoint({ x: hingePos.x + leafWidth * Math.cos(rad), y: hingePos.y + leafWidth * Math.sin(rad) });
                            }
                        }
                    }
                    project.doors.forEach(door => {
                        const wall = project.walls.find(w => w.id === door.wallId); if (!wall) return;
                        const dx = wall.x2 - wall.x1; const dy = wall.y2 - wall.y1; const wallLen = Math.sqrt(dx * dx + dy * dy); if (wallLen === 0) return;
                        const t = door.offset / wallLen; const cx = wall.x1 + t * dx; const cy = wall.y1 + t * dy; const angleRad = Math.atan2(dy, dx);
                        const halfWidth = door.width / 2; const halfThick = wall.thickness / 2;
                        updateBoundsWithPoint(toWorld(-halfWidth, -halfThick, angleRad, cx, cy)); updateBoundsWithPoint(toWorld(halfWidth, -halfThick, angleRad, cx, cy));
                        updateBoundsWithPoint(toWorld(-halfWidth, halfThick, angleRad, cx, cy)); updateBoundsWithPoint(toWorld(halfWidth, halfThick, angleRad, cx, cy));
                        const openDir = door.side === 'side1' ? 1 : -1;
                        if (door.type === 'single') {
                            const leafWidth = door.width; const hingeX_local = door.swing === 'left' ? -halfWidth : halfWidth; const hingeY_local = door.side === 'side1' ? -halfThick : halfThick;
                            const hingePos = toWorld(hingeX_local, hingeY_local, angleRad, cx, cy); const closedTipX_local = hingeX_local + (door.swing === 'left' ? leafWidth : -leafWidth);
                            const closedTipPos = toWorld(closedTipX_local, hingeY_local, angleRad, cx, cy); const openTipPos = toWorld(hingeX_local, hingeY_local + openDir * leafWidth, angleRad, cx, cy);
                            updateBoundsWithPoint(hingePos); updateBoundsWithPoint(closedTipPos); updateBoundsWithPoint(openTipPos); checkArcExtremities(hingePos, leafWidth, closedTipPos, openTipPos);
                        } else if (door.type === 'double') {
                            const leafWidth = door.width / 2; const hingeY_local = door.side === 'side1' ? -halfThick : halfThick;
                            const leftHingePos = toWorld(-halfWidth, hingeY_local, angleRad, cx, cy); const leftClosedTipPos = toWorld(0, hingeY_local, angleRad, cx, cy);
                            const leftOpenTipPos = toWorld(-halfWidth, hingeY_local + openDir * leafWidth, angleRad, cx, cy);
                            updateBoundsWithPoint(leftHingePos); updateBoundsWithPoint(leftClosedTipPos); updateBoundsWithPoint(leftOpenTipPos); checkArcExtremities(leftHingePos, leafWidth, leftClosedTipPos, leftOpenTipPos);
                            const rightHingePos = toWorld(halfWidth, hingeY_local, angleRad, cx, cy); const rightClosedTipPos = toWorld(0, hingeY_local, angleRad, cx, cy);
                            const rightOpenTipPos = toWorld(halfWidth, hingeY_local + openDir * leafWidth, angleRad, cx, cy);
                            updateBoundsWithPoint(rightHingePos); updateBoundsWithPoint(rightOpenTipPos); checkArcExtremities(rightHingePos, leafWidth, rightClosedTipPos, rightOpenTipPos);
                        } else if (door.type === 'four-panel') {
                            const leafWidth = door.width / 4; const hingeY_local = door.side === 'side1' ? -halfThick : halfThick;
                            const processPanel = (hingeX_local, closedTipX_local) => {
                                const hingePos = toWorld(hingeX_local, hingeY_local, angleRad, cx, cy); const closedTipPos = toWorld(closedTipX_local, hingeY_local, angleRad, cx, cy);
                                const openTipPos = toWorld(hingeX_local, hingeY_local + openDir * leafWidth, angleRad, cx, cy);
                                updateBoundsWithPoint(hingePos); updateBoundsWithPoint(closedTipPos); updateBoundsWithPoint(openTipPos); checkArcExtremities(hingePos, leafWidth, closedTipPos, openTipPos);
                            };
                            processPanel(-halfWidth, -halfWidth + leafWidth); processPanel(-halfWidth + leafWidth, 0);
                            processPanel(halfWidth, halfWidth - leafWidth); processPanel(halfWidth - leafWidth, 0);
                        }
                    });
                }
                const PADDING = 50;
                const exportWidth = (maxX - minX) + PADDING * 2;
                const exportHeight = (maxY - minY) + PADDING * 2;
                const svgNode = svgRef.current.cloneNode(true);
                svgNode.querySelectorAll('[data-export-ignore="true"]').forEach(el => el.remove());
                svgNode.setAttribute('width', exportWidth.toString());
                svgNode.setAttribute('height', exportHeight.toString());
                const backgroundRect = svgNode.querySelector('rect');
                if (backgroundRect) { backgroundRect.setAttribute('fill', 'white'); }
                const g = svgNode.querySelector('g');
                if (g) {
                    g.setAttribute('transform', `translate(${-minX + PADDING}, ${-minY + PADDING})`);
                    g.querySelectorAll('line, path, rect, circle, g, polygon').forEach((el) => {
                        el.removeAttribute('class'); el.style.stroke = 'black';
                        if (el.tagName.toLowerCase() !== 'polygon') { el.style.fill = 'none'; } 
                        else { el.style.fill = '#e0e0e0'; el.style.stroke = '#a0a0a0'; el.style.strokeWidth = '1'; }
                        el.style.strokeLinecap = 'round'; el.style.strokeLinejoin = 'round';
                        const strokeWidth = el.dataset.exportStrokewidth;
                        if (strokeWidth) { el.style.strokeWidth = `${strokeWidth}px`; }
                    });
                    g.querySelectorAll('text').forEach((el) => { el.removeAttribute('class'); el.style.fill = 'black'; el.style.stroke = 'none'; });
                    g.querySelectorAll('[data-text-bg="true"]').forEach((el) => { el.style.fill = 'white'; el.style.stroke = 'none'; });
                }
                const svgString = new XMLSerializer().serializeToString(svgNode);
				const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
				const url = URL.createObjectURL(blob);
				const img = new Image();
				img.onload = () => {
					const canvas = document.createElement('canvas');
					
					// Giới hạn kích thước canvas tối đa
					const MAX_DIMENSION = 8192; // 16384 Giới hạn của hầu hết trình duyệt
					let scaleFactor = 2;
					
					// Tính toán scaleFactor phù hợp
					let targetWidth = exportWidth * scaleFactor;
					let targetHeight = exportHeight * scaleFactor;
					
					if (targetWidth > MAX_DIMENSION || targetHeight > MAX_DIMENSION) {
						const widthScale = MAX_DIMENSION / exportWidth;
						const heightScale = MAX_DIMENSION / exportHeight;
						scaleFactor = Math.min(widthScale, heightScale) * 0.95; // 0.95 để an toàn
					}
					
					canvas.width = exportWidth * scaleFactor;
					canvas.height = exportHeight * scaleFactor;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
						// Logic này hơi phức tạp
                        //ctx.scale(scaleFactor, scaleFactor);
                        //ctx.drawImage(img, 0, 0);
						// Đảm bảo canvas luôn có nền trắng để tránh trường hợp ảnh PNG xuất ra có nền đen.
						ctx.fillStyle = 'white';
						ctx.fillRect(0, 0, canvas.width, canvas.height);
						// sử dụng phương thức drawImage với 5 tham số để trình duyệt tự động thực hiện việc thu nhỏ hình ảnh cho vừa với canvas:
						ctx.drawImage(img, 0, 0, canvas.width, canvas.height); // 
                        const pngUrl = canvas.toDataURL('image/png');
                        const a = document.createElement('a');
                        a.href = pngUrl;
                        a.download = `${project.projectName.replace(/\s+/g, '_') || 'floorplan'}.png`;
                        a.click();
						a.remove();
                    }
                    URL.revokeObjectURL(url);
                };
                img.onerror = (e) => {
                    console.error("Failed to load SVG for export", e);
                    alert("Failed to render SVG for export. Check console for details.");
                    URL.revokeObjectURL(url);
                };
                img.src = url;
            }, 100);
        }, [project]);

        const handleExportPdf = () => {
            if (!project || !svgRef.current) return;
            setIsPdfModalOpen(false);
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const hasContent = project.walls.length > 0 || project.textLabels.length > 0 || project.furniture.length > 0 || project.arcs.length > 0 || project.rectangles.length > 0 || project.circularArcs.length > 0 || project.dimensionLines.length > 0 || project.doors.length > 0 || project.windows.length > 0 || project.rooms.length > 0;
            if (!hasContent) { minX = -10000; maxX = 10000; minY = -10000; maxY = 10000; } // Tăng/giảm để zoom out/in
            else {
                const updateBoundsWithPoint = (p) => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); };
                project.walls.forEach(w => { updateBoundsWithPoint({x: w.x1, y: w.y1}); updateBoundsWithPoint({x: w.x2, y: w.y2}); });
                project.rooms.forEach(r => r.points.forEach(updateBoundsWithPoint));
                project.textLabels.forEach(t => { updateBoundsWithPoint({x: t.x, y: t.y}); });
                project.furniture.forEach(f => {
                  const dim = FURNITURE_DIMENSIONS[f.type]; if(!dim) return; const angle = f.rotation * Math.PI / 180; const w = dim.width*f.scaleX/2; const h = dim.height*f.scaleY/2;
                  [{x:-w,y:-h},{x:w,y:-h},{x:w,y:h},{x:-w,y:h}].forEach(c => updateBoundsWithPoint({x: f.x + c.x*Math.cos(angle)-c.y*Math.sin(angle), y: f.y + c.x*Math.sin(angle)+c.y*Math.cos(angle)}));
                });
                project.arcs.forEach(a => { updateBoundsWithPoint({x: a.x1, y: a.y1}); updateBoundsWithPoint({x: a.x2, y: a.y2}); updateBoundsWithPoint({x: a.cx, y: a.cy}); });
                project.circularArcs.forEach(a => { updateBoundsWithPoint({x: a.cx-a.radius, y: a.cy-a.radius}); updateBoundsWithPoint({x: a.cx+a.radius, y: a.cy+a.radius}); });
                project.rectangles.forEach(r => { updateBoundsWithPoint({x: r.x-r.width/2, y:r.y-r.height/2}); updateBoundsWithPoint({x: r.x+r.width/2, y: r.y+r.height/2}); });
                project.dimensionLines.forEach(line => {
                    const { x1, y1, x2, y2, offset } = line; const dx = x2-x1; const dy = y2-y1; const len = Math.sqrt(dx*dx+dy*dy); if (len===0) return;
                    const nx = -dy/len; const ny = dx/len; const ext = 12;
                    const p1_off = {x:x1+offset*nx, y:y1+offset*ny}; const p1_ext_end = {x:p1_off.x+nx*ext, y:p1_off.y+ny*ext};
                    const p2_off = {x:x2+offset*nx, y:y2+offset*ny}; const p2_ext_end = {x:p2_off.x+nx*ext, y:p2_off.y+ny*ext};
                    updateBoundsWithPoint({x:x1,y:y1}); updateBoundsWithPoint({x:x2,y:y2}); updateBoundsWithPoint(p1_ext_end); updateBoundsWithPoint(p2_ext_end);
                });
            }
            const PADDING = 50;
            const drawingContentWidth = (maxX - minX); const drawingContentHeight = (maxY - minY);
            const drawingWidth = drawingContentWidth + PADDING * 2; const drawingHeight = drawingContentHeight + PADDING * 2;
            const svgNode = svgRef.current.cloneNode(true);
            svgNode.querySelectorAll('[data-export-ignore="true"]').forEach(el => el.remove());
            svgNode.setAttribute('width', drawingWidth.toString()); svgNode.setAttribute('height', drawingHeight.toString());
            const backgroundRect = svgNode.querySelector('rect');
            if (backgroundRect) backgroundRect.setAttribute('fill', 'white');
            const g = svgNode.querySelector('g');
            if (g) {
                g.setAttribute('transform', `translate(${-minX + PADDING}, ${-minY + PADDING})`);
                g.querySelectorAll('line, path, rect, circle, g, polygon').forEach((el) => {
                    el.removeAttribute('class'); el.style.stroke = 'black';
                    el.style.fill = el.tagName.toLowerCase() !== 'polygon' ? 'none' : '#e0e0e0';
                    if (el.tagName.toLowerCase() === 'polygon') { el.style.stroke = '#a0a0a0'; el.style.strokeWidth = '1'; }
                    el.style.strokeLinecap = 'round'; el.style.strokeLinejoin = 'round';
                });
                g.querySelectorAll('text').forEach((el) => { el.removeAttribute('class'); el.style.fill = 'black'; el.style.stroke = 'none'; });
                g.querySelectorAll('[data-text-bg="true"]').forEach((el) => { el.style.fill = 'white'; el.style.stroke = 'none'; });
            }
            const svgString = new XMLSerializer().serializeToString(svgNode);
            const url = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }));
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: pdfOptions.orientation, unit: 'mm', format: pdfOptions.paperSize });
            const pageDimensions = doc.internal.pageSize;
            const pageWidth = pageDimensions.getWidth(); const pageHeight = pageDimensions.getHeight();
            const MARGIN = 10; const TITLE_BLOCK_HEIGHT = 20;
            const drawableWidth = pageWidth - (MARGIN * 2); const drawableHeight = pageHeight - (MARGIN * 2) - TITLE_BLOCK_HEIGHT;
            const scale = Math.min(drawableWidth / drawingWidth, drawableHeight / drawingHeight);
            const imageWidthOnPdf = drawingWidth * scale; const imageHeightOnPdf = drawingHeight * scale;
            const imageOffsetX = MARGIN + (drawableWidth - imageWidthOnPdf) / 2; const imageOffsetY = MARGIN;
            const img = new Image();
            img.onload = () => {
                const DPI = 300;
                const canvas = document.createElement('canvas');
                canvas.width = (imageWidthOnPdf / 25.4) * DPI; canvas.height = (imageHeightOnPdf / 25.4) * DPI;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    const imageUrl = canvas.toDataURL('image/jpeg', 0.9);
                    doc.addImage(imageUrl, 'JPEG', imageOffsetX, imageOffsetY, imageWidthOnPdf, imageHeightOnPdf);
                    const titleBlockY = pageHeight - MARGIN - TITLE_BLOCK_HEIGHT;
                    doc.setDrawColor(0); doc.setLineWidth(0.2);
                    doc.rect(MARGIN, titleBlockY, drawableWidth, TITLE_BLOCK_HEIGHT);
                    const col1X = MARGIN + drawableWidth * 0.5; const col2X = MARGIN + drawableWidth * 0.75;
                    const row1Y = titleBlockY + TITLE_BLOCK_HEIGHT / 2;
                    doc.line(col1X, titleBlockY, col1X, titleBlockY + TITLE_BLOCK_HEIGHT);
                    doc.line(col2X, titleBlockY, col2X, titleBlockY + TITLE_BLOCK_HEIGHT);
                    doc.line(MARGIN, row1Y, col2X, row1Y);
                    doc.setFontSize(8); doc.setTextColor(100);
                    const textY1 = titleBlockY + 5; const textY2 = row1Y + 5;
                    doc.text('PROJECT:', MARGIN + 2, textY1); doc.text(pdfOptions.projectName, MARGIN + 22, textY1);
                    doc.text('DESIGNER:', MARGIN + 2, textY2); doc.text(pdfOptions.designer, MARGIN + 22, textY2);
                    const finalScale = `1 : ${Math.round(1/scale)}`;
                    doc.text('SCALE:', col1X + 2, textY1); doc.text(finalScale, col1X + 15, textY1);
                    doc.text('DATE:', col1X + 2, textY2); doc.text(pdfOptions.date, col1X + 15, textY2);
                    doc.text('PAPER:', col2X + 2, textY1);
                    doc.text(`${pdfOptions.paperSize.toUpperCase()} ${pdfOptions.orientation === 'l' ? 'Landscape' : 'Portrait'}`, col2X + 2, textY2);
                    doc.save(`${pdfOptions.projectName.replace(/\s+/g, '_') || 'floorplan'}.pdf`);
                }
                URL.revokeObjectURL(url);
            };
            img.src = url;
        };

        const handleFileChange = (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const parsedProject = JSON.parse(e.target?.result);
                    if (parsedProject.projectId && Array.isArray(parsedProject.walls)) {
                        if (!parsedProject.rooms) parsedProject.rooms = [];
                        if (!parsedProject.textLabels) parsedProject.textLabels = [];
                        if (!parsedProject.furniture) parsedProject.furniture = [];
                        if (!parsedProject.arcs) parsedProject.arcs = [];
                        if (!parsedProject.circularArcs) parsedProject.circularArcs = [];
                        if (!parsedProject.rectangles) parsedProject.rectangles = [];
                        if (!parsedProject.dimensionLines) parsedProject.dimensionLines = [];
                        if (!parsedProject.doors) parsedProject.doors = [];
                        if (!parsedProject.windows) parsedProject.windows = [];
                        parsedProject.rectangles.forEach(r => {
                            if (r.showTop === undefined) r.showTop = true;
                            if (r.showRight === undefined) r.showRight = true;
                            if (r.showBottom === undefined) r.showBottom = true;
                            if (r.showLeft === undefined) r.showLeft = true;
                        });
                        parsedProject.furniture.forEach((f) => {
                            if (f.scale !== undefined) { f.scaleX = f.scale; f.scaleY = f.scale; delete f.scale; }
                            if (f.scaleX === undefined) f.scaleX = 1; if (f.scaleY === undefined) f.scaleY = 1;
                        });
                        setProject(parsedProject); setHistory([parsedProject]); setHistoryIndex(0);
                        clearSelection(); setMode('select');
                    } else { alert('Invalid project file format.'); }
                } catch (error) { alert('Could not read or parse the project file.'); }
            };
            reader.readAsText(file);
            event.target.value = '';
        };

        const openTraceImage = () => {
            traceFileInputRef.current?.click();
            setIsFileMenuOpen(false);
        }

        const handleTraceImageChange = (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    setTraceImage({
                        url: img.src,
                        width: img.width, height: img.height,
                        aspectRatio: img.width / img.height,
                        x: -img.width / 2, y: -img.height / 2,
                        opacity: 0.5, visible: true,
                    });
                    setIsInspectorOpen(true);
                };
                img.src = e.target?.result;
            };
            reader.readAsDataURL(file);
            event.target.value = '';
        };

        useEffect(() => {
            if (project && canvasContainerRef.current) {
                const { width, height } = canvasContainerRef.current.getBoundingClientRect();
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                const hasContent = project.walls.length > 0 || project.textLabels.length > 0 || project.furniture.length > 0 || project.arcs.length > 0 || project.rectangles.length > 0 || project.circularArcs.length > 0 || project.rooms.length > 0;
                if (!hasContent) { minX = -10000; maxX = 10000; minY = -10000; maxY = 10000; } // Tăng/giảm để zoom out/in
                else {
                    project.walls.forEach(w => { minX = Math.min(minX, w.x1, w.x2); minY = Math.min(minY, w.y1, w.y2); maxX = Math.max(maxX, w.x1, w.x2); maxY = Math.max(maxY, w.y1, w.y2); });
                    project.rooms.forEach(r => r.points.forEach(p => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }));
                    project.textLabels.forEach(t => { minX = Math.min(minX, t.x); minY = Math.min(minY, t.y); maxX = Math.max(maxX, t.x); maxY = Math.max(maxY, t.y); });
                    project.furniture.forEach(f => { minX = Math.min(minX, f.x); minY = Math.min(minY, f.y); maxX = Math.max(maxX, f.x); maxY = Math.max(maxY, f.y); });
                    project.arcs.forEach(a => { minX = Math.min(minX, a.x1, a.x2, a.cx); minY = Math.min(minY, a.y1, a.y2, a.cy); maxX = Math.max(maxX, a.x1, a.x2, a.cx); maxY = Math.max(maxY, a.y1, a.y2, a.cy); });
                    project.circularArcs.forEach(a => { minX = Math.min(minX, a.cx - a.radius); minY = Math.min(minY, a.cy - a.radius); maxX = Math.max(maxX, a.cx + a.radius); maxY = Math.max(maxY, a.cy + a.radius); });
                    project.rectangles.forEach(r => { minX = Math.min(minX, r.x - r.width/2); minY = Math.min(minY, r.y - r.height/2); maxX = Math.max(maxX, r.x + r.width/2); maxY = Math.max(maxY, r.y + r.height/2); });
                }
                const projectWidth = Math.max(1, maxX - minX);
                const projectHeight = Math.max(1, maxY - minY);
                const scale = Math.min(width / projectWidth, height / projectHeight) * 1.2; // Đổi 0.9 thành 0.7 để zoom out, 1.2 để zoom in
                setView({ scale, offsetX: width / 2 - (minX + projectWidth / 2) * scale, offsetY: height / 2 - (minY + projectHeight / 2) * scale });
            }
        }, [project?.projectId]);

        useEffect(() => {
            const handleKeyDown = (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
                if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
                if (e.key === 'Escape') {
                    setDrawingState(null); setHoveredRoomPolygon(null); setDragAction(null);
                    clearSelection(); setMode('select'); setPlacingFurnitureType(null);
                    setIsPdfModalOpen(false); setIsFileMenuOpen(false); setIsExportMenuOpen(false); setIsFurniturePanelOpen(false);
                }
                const activeEl = document.activeElement;
                const isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');
                if ((e.key === 'Delete' || e.key === 'Backspace') && !isInputFocused) {
                    deleteSelectedItem();
                }
            };
            const handleClickOutside = (e) => {
                if (fileMenuRef.current && !fileMenuRef.current.contains(e.target)) { setIsFileMenuOpen(false); }
                if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) { setIsExportMenuOpen(false); }
                if (furniturePanelRef.current && !furniturePanelRef.current.contains(e.target)) { setIsFurniturePanelOpen(false); }
            };
            window.addEventListener('keydown', handleKeyDown);
            document.addEventListener('mousedown', handleClickOutside);
            return () => {
                window.removeEventListener('keydown', handleKeyDown);
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }, [undo, redo, selectedWallId, selectedRoomId, selectedTextId, selectedFurnitureId, selectedArcId, selectedCircularArcId, selectedRectangleId, selectedDimensionLineId, selectedDoorId, selectedWindowId]);

        const getSVGPoint = useCallback((clientX, clientY) => {
            if (!svgRef.current) return { x: 0, y: 0 };
            const pt = svgRef.current.createSVGPoint();
            pt.x = clientX; pt.y = clientY;
            const ctm = svgRef.current.getScreenCTM();
            if (!ctm) return { x: 0, y: 0 };
            return pt.matrixTransform(ctm.inverse());
        }, []);

        const getSnapPoint = useCallback((x, y, excludeId = null) => {
            if (!project) return { x, y, isSnapped: false };
            const checkPoint = (px, py) => {
                const dist = Math.sqrt((x - px)**2 + (y - py)**2);
                if (dist * view.scale < SNAP_DISTANCE) return { x: px, y: py, isSnapped: true };
                return null;
            };
            for (const wall of project.walls) {
                if (wall.id === excludeId) continue;
                const p1 = checkPoint(wall.x1, wall.y1); if (p1) return p1;
                const p2 = checkPoint(wall.x2, wall.y2); if (p2) return p2;
            }
            for (const rect of project.rectangles) {
                if (rect.id === excludeId) continue;
                const { x: cx, y: cy, width, height, rotation } = rect;
                const angle = rotation * Math.PI / 180;
                const cos = Math.cos(angle); const sin = Math.sin(angle);
                const halfW = width / 2; const halfH = height / 2;
                const corners = [ { x: -halfW, y: -halfH }, { x: halfW, y: -halfH }, { x: halfW, y: halfH },  { x: -halfW, y: halfH } ];
                for (const corner of corners) {
                    const worldX = cx + corner.x * cos - corner.y * sin;
                    const worldY = cy + corner.x * sin + corner.y * cos;
                    const p = checkPoint(worldX, worldY); if (p) return p;
                }
            }
            return { x, y, isSnapped: false };
        }, [project, view.scale]);

        const zoom = (direction) => {
            if (!canvasContainerRef.current) return;
            const zoomFactor = 1.3;
            const newScale = direction === 'in' ? view.scale * zoomFactor : view.scale / zoomFactor;
            const rect = canvasContainerRef.current.getBoundingClientRect();
            const clientX = rect.left + rect.width / 2;
            const clientY = rect.top + rect.height / 2;
            const centerPoint = getSVGPoint(clientX, clientY);
            const newOffsetX = centerPoint.x - (centerPoint.x - view.offsetX) * (newScale / view.scale);
            const newOffsetY = centerPoint.y - (centerPoint.y - view.offsetY) * (newScale / view.scale);
            setView({ scale: Math.max(0.05, Math.min(newScale, 50)), offsetX: newOffsetX, offsetY: newOffsetY });
        };

        const handleWheel = (e) => {
            e.preventDefault();
            const zoomFactor = 1.1;
            const newScale = e.deltaY < 0 ? view.scale * zoomFactor : view.scale / zoomFactor;
            const mousePoint = getSVGPoint(e.clientX, e.clientY);
            const newOffsetX = mousePoint.x - (mousePoint.x - view.offsetX) * (newScale / view.scale);
            const newOffsetY = mousePoint.y - (mousePoint.y - view.offsetY) * (newScale / view.scale);
            setView({ scale: Math.max(0.05, Math.min(newScale, 50)), offsetX: newOffsetX, offsetY: newOffsetY });
        };
        
        const handleMouseDown = (e) => {
            e.preventDefault();
            if (e.button === 1 || e.altKey) {
              setIsPanning(true);
              setPanStart({ x: e.clientX, y: e.clientY });
              return;
            }
            if (e.button !== 0) return;
            const userPoint = getSVGPoint(e.clientX, e.clientY);
            const point = { x: (userPoint.x - view.offsetX) / view.scale, y: (userPoint.y - view.offsetY) / view.scale };
            if (mode === 'place_furniture' && placingFurnitureType) {
                const newFurniture = {
                    id: `f_${crypto.randomUUID()}`,
                    type: placingFurnitureType,
                    x: point.x, y: point.y,
                    scaleX: DEFAULT_FURNITURE_SCALE, scaleY: DEFAULT_FURNITURE_SCALE, rotation: 0, thickness: DEFAULT_THICKNESS
                };
                updateProject(p => ({...p, furniture: [...(p.furniture || []), newFurniture]}), "Add Furniture");
                setSelectedFurnitureId(newFurniture.id);
                clearSelection('furniture');
                setMode('select');
                setPlacingFurnitureType(null);
                setDrawingState(null);
                return;
            }
            if (mode === 'draw_room' && hoveredRoomPolygon) {
                const newRoom = {
                    id: `room_${crypto.randomUUID()}`,
                    name: 'Room',
                    points: hoveredRoomPolygon.points,
                    color: '#38bdf8',
                };
                updateProject(p => ({ ...p, rooms: [...(p.rooms || []), newRoom] }), "Create Room");
                setSelectedRoomId(newRoom.id);
                setHoveredRoomPolygon(null);
                setMode('select');
                return;
            }
            if(mode === 'draw_door' || mode === 'draw_window') {
                if(drawingState?.preview) {
                    if (mode === 'draw_door') {
                        const newDoor = {
                            ...drawingState.preview.item,
                            id: `d_${crypto.randomUUID()}`,
                        };
                        updateProject(p => ({...p, doors: [...(p.doors || []), newDoor]}), "Create Door");
                    } else { // draw_window
                         const newWindow = {
                            ...drawingState.preview.item,
                            id: `win_${crypto.randomUUID()}`,
                        };
                        updateProject(p => ({...p, windows: [...(p.windows || []), newWindow]}), "Create Window");
                    }
                }
                return;
            }
            if (mode === 'draw_wall' || mode === 'draw_arc' || mode === 'draw_rectangle' || mode === 'draw_circular_arc' || mode === 'draw_wall_rectangle') {
                const { x, y, isSnapped } = getSnapPoint(point.x, point.y);
                const snappedPoint = { x, y };
                if (!drawingState) {
                  const typeMap = { 'draw_wall': 'wall', 'draw_wall_rectangle': 'wall_rectangle', 'draw_arc': 'arc', 'draw_rectangle': 'rectangle', 'draw_circular_arc': 'circular_arc' };
                  setDrawingState({ type: typeMap[mode], step: 1, start: snappedPoint, current: { ...snappedPoint, isSnapped } });
                  if(mode === 'draw_wall') setLengthInputValue("");
                } else if (mode === 'draw_wall') {
                    const newWall = { id: `w_${crypto.randomUUID()}`, x1: drawingState.start.x, y1: drawingState.start.y, x2: snappedPoint.x, y2: snappedPoint.y, thickness: 10, style: wallStyle };
                    if(newWall.x1 === newWall.x2 && newWall.y1 === newWall.y2) { return; }
                    updateProject(p => ({...p, walls: [...p.walls, newWall]}), "Create Wall");
                    setDrawingState({ type: 'wall', step: 1, start: snappedPoint, current: { ...snappedPoint, isSnapped: isSnapped } });
                    setLengthInputValue("");
                }
            } else if (mode === 'draw_dimension') {
              const { x, y, isSnapped } = getSnapPoint(point.x, point.y);
              const snappedPoint = { x, y };
              if(!drawingState) { setDrawingState({type: 'dimension', step: 1, start: snappedPoint, current: {...snappedPoint, isSnapped}}); } 
              else if (drawingState.step === 1) { setDrawingState({...drawingState, step: 2, end: snappedPoint, current: {...snappedPoint, isSnapped}}); } 
              else if (drawingState.step === 2) {
                const { start, end } = drawingState;
                const dx = end.x - start.x; const dy = end.y - start.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len === 0) { setDrawingState(null); return; }
                const nx = -dy / len; const ny = dx / len;
                const p_dx = point.x - start.x; const p_dy = point.y - start.y;
                const offset = p_dx * nx + p_dy * ny;
                const newDimLine = { id: `dl_${crypto.randomUUID()}`, x1: start.x, y1: start.y, x2: end.x, y2: end.y, offset };
                updateProject(p => ({...p, dimensionLines: [...p.dimensionLines, newDimLine]}), 'Create Dimension');
                setDrawingState(null); setMode('select');
              }
            } else if (mode === 'draw_text') {
                const newText = { id: `t_${crypto.randomUUID()}`, x: point.x, y: point.y, text: "New Text", fontSize: 20, rotation: 0 };
                updateProject(p => ({...p, textLabels: [...(p.textLabels || []), newText]}), "Create Text");
                setSelectedTextId(newText.id); clearSelection('text'); setMode('select');
            } else if (mode === 'select') {
                const eventTarget = e.target;
                const dragHandleInfo = eventTarget.dataset.dragHandle;
                if (dragHandleInfo) {
                    const [type, id, handle, extra] = dragHandleInfo.split(':');
                    if (type === 'wall' && (handle === 'start' || handle === 'end')) { setDragAction({ type: 'move_wall_handle', id, handle }); } 
                    else if (type === 'door-flip-side') { updateSelectedDoor('side', selectedDoor?.side === 'side1' ? 'side2' : 'side1'); return; } 
                    else if (type === 'door-flip-swing') { updateSelectedDoor('swing', selectedDoor?.swing === 'left' ? 'right' : 'left'); return; } 
                    else if (type === 'door' || type === 'window') {
                        const item = type === 'door' ? project?.doors.find(d => d.id === id) : project?.windows.find(w => w.id === id);
                        if (item) {
                            const wall = project?.walls.find(w => w.id === item.wallId);
                            if (wall) {
                                const wallLength = Math.sqrt((wall.x2-wall.x1)**2 + (wall.y2-wall.y1)**2);
                                if (type === 'door') { setSelectedDoorId(id); clearSelection('door'); } 
                                else { setSelectedWindowId(id); clearSelection('window'); }
                                setDragAction({ type: `move_${type}`, id, wallLength });
                            }
                        }
                    } else if (type === 'furniture' && handle === 'rotate') {
                        const f = project?.furniture.find(furn => furn.id === id);
                        if (f) { const startAngle = Math.atan2(point.y - f.y, point.x - f.x) * (180 / Math.PI) - f.rotation; setDragAction({ type: 'rotate_furniture', id, startAngle }); }
                    } else if (type === 'furniture' && handle === 'scale-corner') {
                        const f = project?.furniture.find(furn => furn.id === id);
                        if (f && extra) {
                            const corner = extra; const dim = FURNITURE_DIMENSIONS[f.type];
                            const angle = (f.rotation * Math.PI) / 180; const cos = Math.cos(angle); const sin = Math.sin(angle);
                            const signs = { tl: {sx: -1, sy: -1}, tr: {sx: 1, sy: -1}, bl: {sx: -1, sy: 1}, br: {sx: 1, sy: 1}}[corner];
                            const oppWorldX = f.x + cos * (-signs.sx * dim.width/2 * f.scaleX) - sin * (-signs.sy * dim.height/2 * f.scaleY);
                            const oppWorldY = f.y + sin * (-signs.sx * dim.width/2 * f.scaleX) + cos * (-signs.sy * dim.height/2 * f.scaleY);
                            setDragAction({ type: 'scale_furniture_uniform', id, corner, fixedWorld: {x: oppWorldX, y: oppWorldY}});
                        }
                    } else if (type === 'furniture' && handle === 'scale-side') {
                        const f = project?.furniture.find(furn => furn.id === id); if (f && extra) { setDragAction({ type: 'scale_furniture_side', id, handle: extra }); }
                    } else if (type === 'arc' && (handle === 'start' || handle === 'end' || handle === 'control')) { setDragAction({ type: 'move_arc_handle', id, handle }); } 
                    else if (type === 'circular_arc' && (handle === 'start' || handle === 'end' || handle === 'center')) { setDragAction({ type: 'move_circular_arc_handle', id, handle }); } 
                    else if (type === 'rectangle' && handle === 'rotate') {
                        const r = project?.rectangles.find(rect => rect.id === id);
                        if (r) { const startAngle = Math.atan2(point.y - r.y, point.x - r.x) * (180 / Math.PI) - r.rotation; setDragAction({ type: 'rotate_rectangle', id, startAngle }); }
                    } else if (type === 'rectangle' && handle.startsWith('edge-')) {
                        const side = handle.replace('edge-', ''); const prop = `show${side}`;
                        updateProject(p => {
                            if (!p) return null; const rectIndex = p.rectangles.findIndex(r => r.id === id); if (rectIndex === -1) return p;
                            const newRects = [...p.rectangles]; const currentRect = newRects[rectIndex];
                            newRects[rectIndex] = { ...currentRect, [prop]: !currentRect[prop] };
                            return { ...p, rectangles: newRects };
                        }, `Toggle Rectangle ${side} Edge`);
                    } else if (type === 'dimension' && (handle === 'start' || handle === 'end' || handle === 'offset')) { setDragAction({ type: 'move_dimension_handle', id, handle }); }
                    return;
                }
                let clicked = false;
                if (project?.rooms) { for (const room of [...project.rooms].reverse()) { if (isPointInPolygon(point, room.points)) { setSelectedRoomId(room.id); clearSelection('room'); clicked = true; break; } } }
                if (clicked) return;
                if (project?.dimensionLines) {
                  for (const line of [...project.dimensionLines].reverse()) {
                    const { x1, y1, x2, y2, offset } = line; const dx = x2 - x1; const dy = y2 - y1; const len = Math.sqrt(dx * dx + dy * dy); if (len === 0) continue;
                    const nx = -dy / len; const ny = dx / len;
                    const p1_off = { x: x1 + offset * nx, y: y1 + offset * ny }; const p2_off = { x: x2 + offset * nx, y: y2 + offset * ny };
                    const distToOffsetLine = pointToSegmentDistance(point.x, point.y, p1_off.x, p1_off.y, p2_off.x, p2_off.y);
                    const extension = 12 / view.scale;
                    const p1_ext_end = { x: p1_off.x + nx * extension, y: p1_off.y + ny * extension }; const p2_ext_end = { x: p2_off.x + nx * extension, y: p2_off.y + ny * extension };
                    const distToExt1 = pointToSegmentDistance(point.x, point.y, x1, y1, p1_ext_end.x, p1_ext_end.y); const distToExt2 = pointToSegmentDistance(point.x, point.y, x2, y2, p2_ext_end.x, p2_ext_end.y);
                    const threshold = SELECTION_THRESHOLD / view.scale;
                    if (distToOffsetLine < threshold || distToExt1 < threshold || distToExt2 < threshold) {
                      setSelectedDimensionLineId(line.id); clearSelection('dimension_line');
                      setDragAction({ type: 'move_dimension_line', id: line.id, dx1: point.x - line.x1, dy1: point.y - line.y1, dx2: point.x - line.x2, dy2: point.y - line.y2 });
                      clicked = true; break;
                    }
                  }
                }
                if (clicked) return;
                if (project?.arcs) {
                  for (const arc of [...project.arcs].reverse()) {
                    const p0 = { x: arc.x1, y: arc.y1 }; const p1 = { x: arc.cx, y: arc.cy }; const p2 = { x: arc.x2, y: arc.y2 }; let minDistance = Infinity; const steps = 20; let lastPoint = p0;
                    for (let i = 1; i <= steps; i++) {
                        const t = i / steps; const t_inv = 1 - t;
                        const x = t_inv * t_inv * p0.x + 2 * t_inv * t * p1.x + t * t * p2.x; const y = t_inv * t_inv * p0.y + 2 * t_inv * t * p1.y + t * t * p2.y;
                        const currentPoint = { x, y }; const dist = pointToSegmentDistance(point.x, point.y, lastPoint.x, lastPoint.y, currentPoint.x, currentPoint.y);
                        if (dist < minDistance) minDistance = dist;
                        lastPoint = currentPoint;
                    }
                    const effectiveDist = minDistance - (arc.thickness / 2);
                    if (effectiveDist < SELECTION_THRESHOLD / view.scale) {
                        setSelectedArcId(arc.id); clearSelection('arc');
                        setDragAction({ type: 'move_arc', id: arc.id, dx1: point.x - arc.x1, dy1: point.y - arc.y1, dx2: point.x - arc.x2, dy2: point.y - arc.y2, dxc: point.x - arc.cx, dyc: point.y - arc.cy });
                        clicked = true; break;
                    }
                  }
                }
                if (clicked) return;
                if (project?.circularArcs) {
                    for (const arc of [...project.circularArcs].reverse()) {
                        const distToCenter = Math.sqrt((point.x - arc.cx)**2 + (point.y - arc.cy)**2);
                        if (Math.abs(distToCenter - arc.radius) < (SELECTION_THRESHOLD / view.scale + arc.thickness / 2)) {
                            let angle = Math.atan2(point.y - arc.cy, point.x - arc.cx) * (180 / Math.PI) + 90; if(angle < 0) angle += 360;
                            let start = arc.startAngle; let end = arc.endAngle; let inRange = false; const angleDiff = Math.abs(end - start);
                            if (angleDiff % 360 === 0 && angleDiff !== 0) { inRange = true; } 
                            else if (start <= end) { if (angle >= start && angle <= end) inRange = true; } 
                            else { if (angle >= start || angle <= end) inRange = true; }
                            if (inRange) {
                                setSelectedCircularArcId(arc.id); clearSelection('circular_arc');
                                setDragAction({ type: 'move_circular_arc', id: arc.id, d_cx: point.x - arc.cx, d_cy: point.y - arc.cy });
                                clicked = true; break;
                            }
                        }
                    }
                }
                if (clicked) return;
                if(project?.rectangles) {
                    for(const r of [...project.rectangles].reverse()) {
                      const dx = point.x - r.x; const dy = point.y - r.y; const angle = -r.rotation * Math.PI / 180;
                      const rotatedX = dx * Math.cos(angle) - dy * Math.sin(angle); const rotatedY = dx * Math.sin(angle) + dy * Math.cos(angle);
                      if (Math.abs(rotatedX) < r.width / 2 + SELECTION_THRESHOLD / view.scale && Math.abs(rotatedY) < r.height / 2 + SELECTION_THRESHOLD / view.scale) {
                        setSelectedRectangleId(r.id); clearSelection('rectangle'); setDragAction({ type: 'move_rectangle', id: r.id }); clicked = true; break;
                      }
                    }
                }
                if (clicked) return;
                if(project?.furniture) {
                    for(const f of [...project.furniture].reverse()) {
                        const dx = point.x - f.x; const dy = point.y - f.y; const angle = -f.rotation * Math.PI / 180;
                        const rotatedX = dx * Math.cos(angle) - dy * Math.sin(angle); const rotatedY = dx * Math.sin(angle) + dy * Math.cos(angle);
                        const dim = FURNITURE_DIMENSIONS[f.type];
                        if (Math.abs(rotatedX / f.scaleX) < dim.width / 2 && Math.abs(rotatedY / f.scaleY) < dim.height / 2) {
                          setSelectedFurnitureId(f.id); clearSelection('furniture'); setDragAction({ type: 'move_furniture', id: f.id }); clicked = true; break;
                        }
                    }
                }
                if (clicked) return;
                if(project?.textLabels) {
                  for (const textLabel of [...project.textLabels].reverse()) {
                     const dist = Math.sqrt((point.x - textLabel.x)**2 + (point.y - textLabel.y)**2);
                     const clickableRadius = (textLabel.fontSize * (textLabel.text.length / 2)) * 0.7;
                     if (dist < Math.max(TEXT_SELECTION_RADIUS / view.scale, clickableRadius)) {
                        setSelectedTextId(textLabel.id); clearSelection('text'); setDragAction({ type: 'move_text', id: textLabel.id }); clicked = true; break;
                     }
                  }
                }
                if (clicked) return;
                let closestWall = { id: null, dist: Infinity };
                if (project) {
                  project.walls.forEach(wall => {
                    const distToCenter = pointToSegmentDistance(point.x, point.y, wall.x1, wall.y1, wall.x2, wall.y2);
                    const effectiveDist = distToCenter - (wall.thickness / 2);
                    if (effectiveDist < closestWall.dist) closestWall = { id: wall.id, dist: effectiveDist };
                  });
                }
                if (closestWall.id && closestWall.dist < SELECTION_THRESHOLD / view.scale) {
                    const wall = project?.walls.find(w => w.id === closestWall.id);
                    if (wall) {
                      setSelectedWallId(wall.id); clearSelection('wall');
                      setDragAction({ type: 'move_wall', id: wall.id, dx1: point.x - wall.x1, dy1: point.y - wall.y1, dx2: point.x - wall.x2, dy2: point.y - wall.y2 });
                      clicked = true;
                    }
                }
                if (!clicked) { clearSelection(); setIsPanning(true); setPanStart({ x: e.clientX, y: e.clientY }); }
            }
        };

        const handleMouseMove = (e) => {
            const userPoint = getSVGPoint(e.clientX, e.clientY);
            let point = { x: (userPoint.x - view.offsetX) / view.scale, y: (userPoint.y - view.offsetY) / view.scale };
            setCursorWorldPos(point);
            if (isPanning) {
                const dx = e.clientX - panStart.x; const dy = e.clientY - panStart.y;
                setView(prev => ({ ...prev, offsetX: prev.offsetX + dx, offsetY: prev.offsetY + dy }));
                setPanStart({ x: e.clientX, y: e.clientY });
                return;
            }
            if (mode === 'place_furniture' && placingFurnitureType) {
                setDrawingState({
                    type: 'furniture_preview',
                    step: 0,
                    preview: {
                        type: placingFurnitureType,
                        x: point.x,
                        y: point.y,
                        scaleX: DEFAULT_FURNITURE_SCALE,
                        scaleY: DEFAULT_FURNITURE_SCALE,
                        thickness: DEFAULT_THICKNESS,
                    }
                });
                return;
            }
            if (dragAction) {
                setProject(p => {
                    if (!p) return null;
                    switch(dragAction.type) {
                        case 'move_door': case 'move_window': {
                          const isDoor = dragAction.type === 'move_door'; const items = isDoor ? p.doors : p.windows;
                          const itemIndex = items.findIndex(i => i.id === dragAction.id); if (itemIndex === -1) return p;
                          const item = items[itemIndex]; const wall = p.walls.find(w => w.id === item.wallId); if (!wall) return p;
                          const {t} = findClosestPointOnSegment(point.x, point.y, wall.x1, wall.y1, wall.x2, wall.y2);
                          const newOffset = t * dragAction.wallLength; const newItems = [...items];
                          newItems[itemIndex] = {...item, offset: newOffset};
                          return isDoor ? { ...p, doors: newItems } : { ...p, windows: newItems };
                        }
                        case 'move_wall': {
                            const wallIndex = p.walls.findIndex(w => w.id === dragAction.id); if (wallIndex === -1) return p;
                            const newWalls = [...p.walls]; const wall = newWalls[wallIndex];
                            const new_x1 = point.x - dragAction.dx1; const new_y1 = point.y - dragAction.dy1;
                            const new_x2 = point.x - dragAction.dx2; const new_y2 = point.y - dragAction.dy2;
                            newWalls[wallIndex] = { ...wall, x1: new_x1, y1: new_y1, x2: new_x2, y2: new_y2 };
                            const newRooms = (p.rooms || []).map(room => {
                                const newPolygon = findRoomFromPoint(calculatePolygonCentroid(room.points), newWalls, []);
                                return newPolygon ? { ...room, points: newPolygon.points } : null;
                            }).filter(Boolean);
                            return { ...p, walls: newWalls, rooms: newRooms };
                        }
                        case 'move_wall_handle': {
                            const { x, y } = getSnapPoint(point.x, point.y, dragAction.id); const wallIndex = p.walls.findIndex(w => w.id === dragAction.id); if (wallIndex === -1) return p;
                            const newWalls = [...p.walls];
                            newWalls[wallIndex] = { ...newWalls[wallIndex], ...(dragAction.handle === 'start' ? {x1: x, y1: y} : {x2: x, y2: y}) };
                            const newRooms = (p.rooms || []).map(room => {
                                const newPolygon = findRoomFromPoint(calculatePolygonCentroid(room.points), newWalls, []);
                                return newPolygon ? { ...room, points: newPolygon.points } : null;
                            }).filter(Boolean);
                            return { ...p, walls: newWalls, rooms: newRooms };
                        }
                        case 'move_dimension_line': {
                          const dimIndex = p.dimensionLines.findIndex(d => d.id === dragAction.id); if (dimIndex === -1) return p;
                          const newDims = [...p.dimensionLines]; const line = newDims[dimIndex];
                          const new_x1 = point.x - dragAction.dx1; const new_y1 = point.y - dragAction.dy1;
                          const new_x2 = point.x - dragAction.dx2; const new_y2 = point.y - dragAction.dy2;
                          newDims[dimIndex] = { ...line, x1: new_x1, y1: new_y1, x2: new_x2, y2: new_y2 };
                          return { ...p, dimensionLines: newDims };
                        }
                        case 'move_dimension_handle': {
                          const dimIndex = p.dimensionLines.findIndex(d => d.id === dragAction.id); if (dimIndex === -1) return p;
                          const newDims = [...p.dimensionLines]; const line = newDims[dimIndex];
                          if (dragAction.handle === 'start' || dragAction.handle === 'end') {
                            const { x, y } = getSnapPoint(point.x, point.y, dragAction.id);
                            if (dragAction.handle === 'start') newDims[dimIndex] = { ...line, x1: x, y1: y };
                            else newDims[dimIndex] = { ...line, x2: x, y2: y };
                          } else if (dragAction.handle === 'offset') {
                            const dx = line.x2 - line.x1; const dy = line.y2 - line.y1; const len = Math.sqrt(dx * dx + dy * dy); if (len === 0) return p;
                            const nx = -dy / len; const ny = dx / len;
                            const p_dx = point.x - line.x1; const p_dy = point.y - line.y1;
                            const newOffset = p_dx * nx + p_dy * ny;
                            newDims[dimIndex] = { ...line, offset: newOffset };
                          }
                          return { ...p, dimensionLines: newDims };
                        }
                        case 'move_arc': {
                            const arcIndex = p.arcs.findIndex(a => a.id === dragAction.id); if(arcIndex === -1) return p;
                            const newArcs = [...p.arcs]; const arc = newArcs[arcIndex];
                            const new_x1 = point.x - dragAction.dx1; const new_y1 = point.y - dragAction.dy1;
                            const new_x2 = point.x - dragAction.dx2; const new_y2 = point.y - dragAction.dy2;
                            const new_cx = point.x - dragAction.dxc; const new_cy = point.y - dragAction.dyc;
                            newArcs[arcIndex] = { ...arc, x1: new_x1, y1: new_y1, x2: new_x2, y2: new_y2, cx: new_cx, cy: new_cy };
                            return {...p, arcs: newArcs};
                        }
                        case 'move_circular_arc': {
                            const arcIndex = p.circularArcs.findIndex(a => a.id === dragAction.id); if(arcIndex === -1) return p;
                            const newArcs = [...p.circularArcs]; const arc = newArcs[arcIndex];
                            const new_cx = point.x - dragAction.d_cx; const new_cy = point.y - dragAction.d_cy;
                            newArcs[arcIndex] = { ...arc, cx: new_cx, cy: new_cy };
                            return {...p, circularArcs: newArcs};
                        }
                        case 'move_arc_handle': {
                            const arcIndex = p.arcs.findIndex(a => a.id === dragAction.id); if(arcIndex === -1) return p;
                            const newArcs = [...p.arcs]; const handle = dragAction.handle;
                            if(handle === 'start') newArcs[arcIndex] = {...newArcs[arcIndex], x1: point.x, y1: point.y};
                            else if(handle === 'end') newArcs[arcIndex] = {...newArcs[arcIndex], x2: point.x, y2: point.y};
                            else if(handle === 'control') newArcs[arcIndex] = {...newArcs[arcIndex], cx: point.x, cy: point.y};
                            return {...p, arcs: newArcs};
                        }
                         case 'move_circular_arc_handle': {
                            const arcIndex = p.circularArcs.findIndex(a => a.id === dragAction.id); if(arcIndex === -1) return p;
                            const newArcs = [...p.circularArcs]; const arc = newArcs[arcIndex]; const handle = dragAction.handle;
                            if(handle === 'center') { newArcs[arcIndex] = {...arc, cx: point.x, cy: point.y}; } 
                            else if (handle === 'start' || handle === 'end') {
                                let angle = (Math.atan2(point.y - arc.cy, point.x - arc.cx) * 180 / Math.PI) + 90; if(angle < 0) angle += 360;
                                if(handle === 'start') newArcs[arcIndex] = {...arc, startAngle: angle };
                                else newArcs[arcIndex] = {...arc, endAngle: angle };
                            }
                            return {...p, circularArcs: newArcs};
                        }
                        case 'move_text': {
                           const textIndex = p.textLabels.findIndex(t => t.id === dragAction.id); if (textIndex === -1) return p;
                           const newTexts = [...p.textLabels];
                           newTexts[textIndex] = { ...newTexts[textIndex], x: point.x, y: point.y };
                           return { ...p, textLabels: newTexts };
                        }
                        case 'move_furniture': {
                           const furnitureIndex = p.furniture.findIndex(f => f.id === dragAction.id); if(furnitureIndex === -1) return p;
                           const newFurniture = [...p.furniture];
                           newFurniture[furnitureIndex] = {...newFurniture[furnitureIndex], x: point.x, y: point.y};
                           return {...p, furniture: newFurniture};
                        }
                        case 'move_rectangle': {
                           const rectIndex = p.rectangles.findIndex(r => r.id === dragAction.id); if(rectIndex === -1) return p;
                           const newRects = [...p.rectangles];
                           newRects[rectIndex] = {...newRects[rectIndex], x: point.x, y: point.y};
                           return {...p, rectangles: newRects};
                        }
                        case 'rotate_furniture': {
                            const furnitureIndex = p.furniture.findIndex(f => f.id === dragAction.id); if (furnitureIndex === -1) return p;
                            const furniture = p.furniture[furnitureIndex];
                            const angle = Math.atan2(point.y - furniture.y, point.x - furniture.x) * (180 / Math.PI);
                            const newRotation = angle - (dragAction.startAngle || 0); const newFurniture = [...p.furniture];
                            newFurniture[furnitureIndex] = {...furniture, rotation: newRotation };
                            return {...p, furniture: newFurniture};
                        }
                        case 'rotate_rectangle': {
                            const rectIndex = p.rectangles.findIndex(r => r.id === dragAction.id); if(rectIndex === -1) return p;
                            const rect = p.rectangles[rectIndex];
                            const angle = Math.atan2(point.y - rect.y, point.x - rect.x) * (180 / Math.PI);
                            const newRotation = angle - (dragAction.startAngle || 0); const newRects = [...p.rectangles];
                            newRects[rectIndex] = {...rect, rotation: newRotation};
                            return {...p, rectangles: newRects};
                        }
                        case 'scale_furniture_uniform': {
                            const furnitureIndex = p.furniture.findIndex(f => f.id === dragAction.id); if (furnitureIndex === -1) return p;
                            const f = p.furniture[furnitureIndex]; const dim = FURNITURE_DIMENSIONS[f.type];
                            const halfW = dim.width / 2; const halfH = dim.height / 2;
                            const signs = { tl: {sx: -1, sy: -1}, tr: {sx: 1, sy: -1}, bl: {sx: -1, sy: 1}, br: {sx: 1, sy: 1}, }[dragAction.corner];
                            const fixed = dragAction.fixedWorld; const vmx = point.x - fixed.x; const vmy = point.y - fixed.y;
                            const angle = f.rotation * Math.PI / 180; const cos = Math.cos(angle); const sin = Math.sin(angle);
                            const diff_local = {x: signs.sx * dim.width, y: signs.sy * dim.height};
                            const rot_diff_x = cos * diff_local.x - sin * diff_local.y; const rot_diff_y = sin * diff_local.x + cos * diff_local.y;
                            const diag_len = Math.sqrt(rot_diff_x ** 2 + rot_diff_y ** 2);
                            const unit_x = rot_diff_x / diag_len; const unit_y = rot_diff_y / diag_len;
                            const proj = vmx * unit_x + vmy * unit_y;
                            let new_scale = proj / Math.sqrt(diff_local.x ** 2 + diff_local.y ** 2);
                            new_scale = Math.max(0.1, new_scale || 0.1);
                            const new_center_x = fixed.x - (cos * (-signs.sx * halfW * new_scale) - sin * (-signs.sy * halfH * new_scale));
                            const new_center_y = fixed.y - (sin * (-signs.sx * halfW * new_scale) + cos * (-signs.sy * halfH * new_scale));
                            const newFurniture = [...p.furniture];
                            newFurniture[furnitureIndex] = {...f, x: new_center_x, y: new_center_y, scaleX: new_scale, scaleY: new_scale};
                            return {...p, furniture: newFurniture};
                        }
                         case 'scale_furniture_side': {
                            const furnitureIndex = p.furniture.findIndex(f => f.id === dragAction.id); if (furnitureIndex === -1) return p;
                            const f = p.furniture[furnitureIndex]; const dim = FURNITURE_DIMENSIONS[f.type]; const side = dragAction.handle;
                            const angle_rad = f.rotation * Math.PI / 180; const cos_a = Math.cos(angle_rad); const sin_a = Math.sin(angle_rad);
                            const dx = point.x - f.x; const dy = point.y - f.y;
                            const local_x = dx * cos_a + dy * sin_a; const local_y = -dx * sin_a + dy * cos_a;
                            let new_scaleX = f.scaleX; let new_scaleY = f.scaleY; let new_x = f.x; let new_y = f.y;
                            if (side === 'right' || side === 'left') {
                                const new_half_width = Math.abs(local_x);
                                new_scaleX = (new_half_width * 2) / dim.width;
                                const old_half_width = (dim.width * f.scaleX) / 2;
                                const move_dist = (new_half_width - old_half_width) / 2 * (side === 'left' ? -1 : 1);
                                new_x += move_dist * cos_a; new_y += move_dist * sin_a;
                            } else {
                                const new_half_height = Math.abs(local_y);
                                new_scaleY = (new_half_height * 2) / dim.height;
                                const old_half_height = (dim.height * f.scaleY) / 2;
                                const move_dist = (new_half_height - old_half_height) / 2 * (side === 'top' ? -1 : 1);
                                new_x += move_dist * sin_a; new_y -= move_dist * cos_a;
                            }
                            const newFurnitureArr = [...p.furniture];
                            newFurnitureArr[furnitureIndex] = { ...f, x: new_x, y: new_y, scaleX: new_scaleX, scaleY: new_scaleY };
                            return { ...p, furniture: newFurnitureArr };
                        }
                    }
                    return p;
                });
                return;
            }
             if ((mode === 'draw_door' || mode === 'draw_window') && project) {
                let closestWall = { id: null, dist: Infinity, point: {x: 0, y: 0, t: 0} };
                project.walls.forEach(wall => {
                    const { x, y, t, dist } = findClosestPointOnSegment(point.x, point.y, wall.x1, wall.y1, wall.x2, wall.y2);
                    if (dist < closestWall.dist) { closestWall = { id: wall.id, dist, point: { x, y, t } }; }
                });
                if (closestWall.id && closestWall.dist < (SELECTION_THRESHOLD*2) / view.scale) {
                    const wall = project.walls.find(w => w.id === closestWall.id);
                    const wallLength = Math.sqrt((wall.x2 - wall.x1)**2 + (wall.y2-wall.y1)**2);
                    const offset = closestWall.point.t * wallLength;
                    const itemWidth = mode === 'draw_door' ? 800 : 1200;
                    const previewItem = { wallId: wall.id, offset: offset, width: itemWidth };
                    setDrawingState({
                        type: mode === 'draw_door' ? 'door' : 'window', step: 1, 
                        preview: { wall, item: mode === 'draw_door' ? { ...previewItem, type: doorType, swing: 'left', side: 'side1' } : { ...previewItem, height: 100 } } 
                    });
                } else { setDrawingState(null); }
                return;
            }
            if (mode === 'draw_room' && project) {
                const polygon = findRoomFromPoint(point, project.walls, project.rooms);
                setHoveredRoomPolygon(polygon);
                return;
            }
            if (drawingState && drawingState.type !== 'door' && drawingState.type !== 'window' && drawingState.type !== 'furniture_preview') {
                let {x, y, isSnapped} = getSnapPoint(point.x, point.y);
                if (e.shiftKey) {
                    const dx = Math.abs(x - drawingState.start.x); const dy = Math.abs(y - drawingState.start.y);
                    if (mode === 'draw_rectangle' || mode === 'draw_wall_rectangle') {
                        const side = Math.max(dx, dy);
                        x = drawingState.start.x + Math.sign(x - drawingState.start.x) * side;
                        y = drawingState.start.y + Math.sign(y - drawingState.start.y) * side;
                    } else if(mode === 'draw_wall') { if (dx > dy) y = drawingState.start.y; else x = drawingState.start.x; }
                }
                setDrawingState(prev => prev ? { ...prev, current: {x, y, isSnapped} } : null);
            }
        };

        const handleMouseUp = () => {
            setCursorWorldPos(null); if (isPanning) setIsPanning(false);
            if (dragAction) {
                let message = "Unknown Action";
                if (dragAction.type.startsWith('move_')) message = `Move ${dragAction.type.split('_')[1].replace('handle', '')}`;
                if (dragAction.type.startsWith('rotate_')) message = `Rotate ${dragAction.type.split('_')[1]}`;
                if (dragAction.type.startsWith('scale_')) message = `Scale ${dragAction.type.split('_')[1].replace('uniform', '').replace('side','')}`;
                if (dragAction.type === 'move_arc') message = 'Move Curve';
                if (dragAction.type === 'move_circular_arc') message = 'Move Circular Arc';
                commitDragToHistory(message);
                setDragAction(null);
            }
            if (drawingState && drawingState.type !== 'dimension' && drawingState.start && drawingState.current) {
                const {start, current} = drawingState;
                if(start.x === current.x && start.y === current.y) { if (mode !== 'draw_wall') setDrawingState(null); return; }
                if (mode === 'draw_arc') {
                  const dx = current.x - start.x; const dy = current.y - start.y; const len = Math.sqrt(dx*dx + dy*dy);
                  const nx = -dy / len; const ny = dx / len; const controlOffset = len * 0.2;
                  const newArc = { id: `a_${crypto.randomUUID()}`, x1: start.x, y1: start.y, x2: current.x, y2: current.y, cx: (start.x + current.x)/2 + controlOffset * nx, cy: (start.y + current.y)/2 + controlOffset * ny, thickness: 5, style: arcStyle };
                  updateProject(p => ({...p, arcs: [...p.arcs, newArc]}), "Create Arc");
                  setSelectedArcId(newArc.id); clearSelection('arc');
                }
                if(mode === 'draw_circular_arc') {
                  const radius = Math.sqrt((current.x - start.x)**2 + (current.y - start.y)**2);
                  const newArc = { id: `ca_${crypto.randomUUID()}`, cx: start.x, cy: start.y, radius: radius, startAngle: 0, endAngle: 180, thickness: 5, style: arcStyle, };
                  updateProject(p => ({...p, circularArcs: [...p.circularArcs, newArc]}), "Create Circular Arc");
                  setSelectedCircularArcId(newArc.id); clearSelection('circular_arc');
                }
                if (mode === 'draw_rectangle') {
                  const width = Math.abs(start.x - current.x); const height = Math.abs(start.y - current.y);
                  const newRect = { id: `r_${crypto.randomUUID()}`, x: (start.x + current.x) / 2, y: (start.y + current.y) / 2, width, height, rotation: 0, topLeftRadius: 0, topRightRadius: 0, bottomLeftRadius: 0, bottomRightRadius: 0, thickness: 5, style: rectangleStyle, showTop: true, showRight: true, showBottom: true, showLeft: true };
                  updateProject(p => ({...p, rectangles: [...p.rectangles, newRect]}), "Create Rectangle");
                  setSelectedRectangleId(newRect.id); clearSelection('rectangle');
                }
                if (mode === 'draw_wall_rectangle') {
                    const p1 = { x: start.x, y: start.y }; const p2 = { x: current.x, y: start.y }; const p3 = { x: current.x, y: current.y }; const p4 = { x: start.x, y: current.y };
                    const wallDefaults = { thickness: 10, style: wallStyle };
                    const newWalls = [
                        { id: `w_${crypto.randomUUID()}`, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, ...wallDefaults },
                        { id: `w_${crypto.randomUUID()}`, x1: p2.x, y1: p2.y, x2: p3.x, y2: p3.y, ...wallDefaults },
                        { id: `w_${crypto.randomUUID()}`, x1: p3.x, y1: p3.y, x2: p4.x, y2: p4.y, ...wallDefaults },
                        { id: `w_${crypto.randomUUID()}`, x1: p4.x, y1: p4.y, x2: p1.x, y2: p1.y, ...wallDefaults },
                    ];
                    updateProject(p => ({ ...p, walls: [...p.walls, ...newWalls] }), "Create Wall Rectangle");
                }
                if (mode !== 'draw_wall') { setDrawingState(null); setMode('select'); }
            }
        };

        const handleFurnitureDragStart = (e, type) => {
            e.dataTransfer.setData("furnitureType", type);
            e.dataTransfer.effectAllowed = "copy";
        };
        const handleSelectFurnitureForPlacement = (type) => {
            setPlacingFurnitureType(type);
            setMode('place_furniture');
            setIsFurniturePanelOpen(false);
        };
        const handleCanvasDrop = (e) => {
            e.preventDefault();
            const type = e.dataTransfer.getData("furnitureType");
            if (!type || !FURNITURE_DIMENSIONS[type]) return;
            const {x, y} = getSVGPoint(e.clientX, e.clientY);
            const point = { x: (x - view.offsetX) / view.scale, y: (y - view.offsetY) / view.scale };
            const newFurniture = {
                id: `f_${crypto.randomUUID()}`, type,
                x: point.x, y: point.y, scaleX: DEFAULT_FURNITURE_SCALE, scaleY: DEFAULT_FURNITURE_SCALE, rotation: 0, thickness: DEFAULT_THICKNESS
            };
            updateProject(p => ({...p, furniture: [...p.furniture, newFurniture]}), "Add Furniture");
            setSelectedFurnitureId(newFurniture.id);
            clearSelection('furniture');
            setMode('select');
        };
        
        const handleLengthInputKey = (e) => {
            if (e.key === 'Enter' && drawingState && drawingState.type === 'wall' && drawingState.start) {
                const length = parseFloat(lengthInputValue); if (isNaN(length) || length <= 0) return;
                const { start, current } = drawingState; let endX = start.x, endY = start.y;
                const dx = current.x - start.x; const dy = current.y - start.y;
                if (Math.abs(dx) > Math.abs(dy)) { endX += (dx >= 0 ? 1 : -1) * length; } else { endY += (dy >= 0 ? 1 : -1) * length; }
                const newWall = { id: `w_${crypto.randomUUID()}`, x1: start.x, y1: start.y, x2: endX, y2: endY, thickness: 10, style: wallStyle };
                updateProject(p => ({...p, walls: [...p.walls, newWall]}), "Create Wall by Length");
                setDrawingState({ type: 'wall', step: 1, start: { x: endX, y: endY }, current: { x: endX, y: endY, isSnapped: true } });
                setLengthInputValue("");
            }
        };
        const handleCanvasTouchStart = (e) => {
            touchMovedRef.current = false;
            if (e.touches.length === 1) {
                const mockMouseEvent = { preventDefault: () => e.preventDefault(), button: 0, clientX: e.touches[0].clientX, clientY: e.touches[0].clientY, target: e.target };
                handleMouseDown(mockMouseEvent);
            } else if (e.touches.length === 2) {
                if (dragAction) setDragAction(null);
                setIsPanning(false);
                const p1 = { x: e.touches[0].clientX, y: e.touches[0].clientY }; const p2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };
                const dist = Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2);
                const centerSVG = getSVGPoint((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
                pinchStateRef.current = { dist, center: centerSVG };
            }
        };
        const handleCanvasTouchMove = (e) => {
            touchMovedRef.current = true;
            if (e.touches.length === 1) {
                const mockMouseEvent = { preventDefault: () => e.preventDefault(), clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
                handleMouseMove(mockMouseEvent);
            } else if (e.touches.length === 2 && pinchStateRef.current) {
                const p1 = { x: e.touches[0].clientX, y: e.touches[0].clientY }; const p2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };
                const newDist = Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2);
                const scaleFactor = newDist / pinchStateRef.current.dist; const newScale = view.scale * scaleFactor;
                const centerPoint = pinchStateRef.current.center;
                const newOffsetX = centerPoint.x - (centerPoint.x - view.offsetX) * scaleFactor;
                const newOffsetY = centerPoint.y - (centerPoint.y - view.offsetY) * scaleFactor;
                setView({ scale: Math.max(0.05, Math.min(newScale, 50)), offsetX: newOffsetX, offsetY: newOffsetY });
                pinchStateRef.current.dist = newDist;
            }
        };
        const handleCanvasTouchEnd = (e) => {
            if (!touchMovedRef.current) { handleMouseUp(); } 
            else if (dragAction || isPanning) { handleMouseUp(); }
            if (e.touches.length < 2) { pinchStateRef.current = null; }
        };
        const DrawPanel = () => {
            if (mode === 'place_furniture') {
                return React.createElement('div', { className: "p-4" },
                    React.createElement('h3', { className: "text-lg font-semibold text-slate-300 mb-3" }, "Place Furniture"),
                    React.createElement('p', { className: "text-sm text-slate-400" }, "Tap on the canvas to place the item. Press 'Escape' to cancel.")
                );
            }
            if (mode === 'draw_wall' && drawingState) {
                return React.createElement('div', { className: "p-4" },
                    React.createElement('h3', { className: "text-lg font-semibold text-slate-300 mb-3" }, "Draw by Length"),
                    React.createElement('p', { className: "text-sm text-slate-400 mb-2" }, "After first click, enter a length and press Enter to draw an axis-aligned wall."),
                    React.createElement('div', null,
                      React.createElement('label', { htmlFor: "lengthInput", className: "block text-slate-400 mb-1" }, `Length (${project?.units})`),
                      React.createElement('input', { type: "number", id: "lengthInput", value: lengthInputValue, onChange: (e) => setLengthInputValue(e.target.value), onKeyDown: handleLengthInputKey,
                        placeholder: "e.g., 4000", className: "w-full bg-slate-700 text-white rounded px-2 py-1 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500", autoFocus: true })
                    )
                );
            }
            if (mode === 'draw_dimension' && drawingState) {
              return React.createElement('div', { className: "p-4" },
                  React.createElement('h3', { className: "text-lg font-semibold text-slate-300 mb-3" }, "Draw Dimension"),
                  React.createElement('p', { className: "text-sm text-slate-400" },
                    drawingState.step === 1 ? "Click to place the first point of the dimension line." :
                    drawingState.step === 2 ? "Click to place the second point." :
                    "Move the mouse to set the offset, then click to place the line."
                  )
                );
            }
             if (mode === 'draw_door' || mode === 'draw_window') {
                return React.createElement('div', { className: "p-4" },
                    React.createElement('h3', { className: "text-lg font-semibold text-slate-300 mb-3" }, "Place " + (mode === 'draw_door' ? 'Door' : 'Window')),
                    React.createElement('p', { className: "text-sm text-slate-400" }, "Hover over a wall to see a preview, then click to place the object.")
                  );
            }
            if (mode === 'draw_room') {
                return React.createElement('div', { className: "p-4" },
                    React.createElement('h3', { className: "text-lg font-semibold text-slate-300 mb-3" }, "Create Room"),
                    React.createElement('p', { className: "text-sm text-slate-400" }, "Hover over an enclosed area to see a preview, then click to create the room.")
                );
            }
            return null;
        }
        
        const tools = [
            {id: 'select', label: 'Select'}, {id: 'draw_wall', label: 'Wall'}, {id: 'draw_wall_rectangle', label: 'Wall Rectangle'},
            {id: 'draw_room', label: 'Room'}, {id: 'draw_door', label: 'Door'}, {id: 'draw_window', label: 'Window'},
            {id: 'draw_dimension', label: 'Dimension'}, {id: 'draw_text', label: 'Text'}, {id: 'draw_arc', label: 'Curve'},
            {id: 'draw_circular_arc', label: 'Circular Arc'}, {id: 'draw_rectangle', label: 'Rectangle'},
        ];

        return React.createElement('div', { className: "flex flex-col h-screen bg-slate-900 font-sans text-white" },
            React.createElement('header', { className: "flex-shrink-0 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-4 h-14 z-40" },
                React.createElement('div', { className: "flex items-center gap-4" }, React.createElement('h1', { className: "text-lg font-bold text-cyan-400" }, "FloorPlan Lite")),
                React.createElement('div', { className: "flex-1 text-center text-slate-400 truncate px-4" }, project?.projectName || 'Untitled Project'),
                React.createElement('div', { className: "flex items-center gap-2" },
                     React.createElement('div', { ref: fileMenuRef, className: "relative" },
                        React.createElement(ActionButton, { onClick: () => setIsFileMenuOpen(o => !o), className: "bg-slate-600 hover:bg-slate-500" }, "File"),
                        isFileMenuOpen && React.createElement('div', { className: "absolute top-full right-0 mt-2 w-48 bg-slate-700 rounded-md shadow-lg border border-slate-600 py-1" },
                                React.createElement('button', { onClick: createNewProject, className: "block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-600" }, "New Project"),
                                React.createElement('button', { onClick: saveProject, disabled: !project, className: "block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-600 disabled:opacity-50" }, "Save Project"),
                                React.createElement('button', { onClick: openProject, className: "block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-600" }, "Open Project"),
                                React.createElement('div', { className: "my-1 h-px bg-slate-600" }),
                                React.createElement('button', { onClick: openTraceImage, className: "block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-600" }, "Import Trace Image")
                            )
                    ),
                     React.createElement('div', { ref: exportMenuRef, className: "relative" },
                        React.createElement(ActionButton, { onClick: () => setIsExportMenuOpen(o => !o), className: "bg-slate-600 hover:bg-slate-500" }, "Export"),
                        isExportMenuOpen && React.createElement('div', { className: "absolute top-full right-0 mt-2 w-48 bg-slate-700 rounded-md shadow-lg border border-slate-600 py-1" },
                                React.createElement('button', { onClick: exportProject, disabled: !project, className: "block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-600 disabled:opacity-50" }, "Export as PNG"),
                                React.createElement('button', { onClick: openPdfModal, disabled: !project, className: "block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-600 disabled:opacity-50" }, "Export as PDF")
                            )
                    ),
                    React.createElement('div', { className: "h-8 border-l border-slate-600 mx-2" }),
                    React.createElement(ActionButton, { onClick: undo, disabled: historyIndex <= 0, className: "bg-slate-700 hover:bg-slate-600 p-2", title: "Undo (Ctrl+Z)" }, React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement('path', { d: "M21 7v6h-6" }), React.createElement('path', { d: "M3 17a9 9 0 0 1 9-9 9 9 0 0 1 9 9" }))),
                    React.createElement(ActionButton, { onClick: redo, disabled: historyIndex >= history.length - 1, className: "bg-slate-700 hover:bg-slate-600 p-2", title: "Redo (Ctrl+Y)" }, React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement('path', { d: "M3 17v-6h6" }), React.createElement('path', { d: "M21 7a9 9 0 0 1-9 9 9 9 0 0 1-9-9" }))),
                    React.createElement('div', { className: "h-8 border-l border-slate-600 mx-2" }),
                    React.createElement(ActionButton, { onClick: () => setIsInspectorOpen(o => !o), className: `${isInspectorOpen ? 'bg-cyan-600' : 'bg-slate-700'} hover:bg-slate-600 p-2`, title: "Toggle Inspector" }, React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement('rect', { x: "3", y: "3", width: "18", height: "18", rx: "2" }), React.createElement('path', { d: "M9 3v18" })))
                )
            ),
            React.createElement('input', { type: "file", ref: fileInputRef, onChange: handleFileChange, className: "hidden", accept: ".json" }),
            React.createElement('input', { type: "file", ref: traceFileInputRef, onChange: handleTraceImageChange, className: "hidden", accept: "image/*" }),
            React.createElement('div', { className: "flex flex-1 min-h-0" },
                React.createElement('nav', { className: "bg-slate-800 border-r border-slate-700 p-2 flex flex-col items-center space-y-1" },
                  tools.map(tool => React.createElement('button', { key: tool.id, onClick: () => setMode(tool.id), title: tool.label, className: `w-12 h-12 flex items-center justify-center rounded-md transition-colors ${mode === tool.id ? 'bg-cyan-500 text-slate-900' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}` }, tool.label.charAt(0))),
                  React.createElement('div', { className: "w-full border-t border-slate-600 my-1" }),
                   React.createElement('button', { onClick: () => setIsFurniturePanelOpen(true), title: "Furniture", className: `w-12 h-12 flex items-center justify-center rounded-md transition-colors ${isFurniturePanelOpen ? 'bg-cyan-500 text-slate-900' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}` }, React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement('path', { d: "M20 9V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v4" }), React.createElement('path', { d: "M2 11h20" }), React.createElement('path', { d: "m10 11-2 8h10l-2-8" }), React.createElement('path', { d: "M10 19v2" }), React.createElement('path', { d: "M16 19v2" })))
                ),
                isFurniturePanelOpen && React.createElement(Fragment, null,
                    React.createElement('div', { className: "fixed inset-0 bg-black/50 z-30 md:hidden", onClick: () => setIsFurniturePanelOpen(false) }),
                    React.createElement('aside', { ref: furniturePanelRef, className: "absolute md:relative left-16 md:left-0 bg-slate-800 border-r border-slate-700 w-80 max-w-[80vw] h-full z-30 p-2" }, React.createElement(FurnitureLibraryUI, { onDragStart: handleFurnitureDragStart, onSelect: handleSelectFurnitureForPlacement, placingFurnitureType: placingFurnitureType }))
                ),
                React.createElement('main', { className: "flex-1 flex flex-col relative bg-slate-800" },
                    React.createElement('div', { className: "absolute top-2 left-2 z-20", 'data-export-ignore': "true" },
                       (mode === 'draw_wall' || mode === 'draw_wall_rectangle') && React.createElement('div', { className: "flex items-center gap-1 bg-slate-900/80 backdrop-blur-sm border border-slate-700 rounded-md p-1" }, ['single', 'double', 'dashed'].map(style => React.createElement('button', { key: style, onClick: () => setWallStyle(style), className: `px-2 py-1 text-xs rounded capitalize ${wallStyle === style ? 'bg-cyan-500 text-slate-900' : 'text-slate-300 hover:bg-slate-600'}` }, style))),
                       mode === 'draw_door' && React.createElement('div', { className: "flex items-center gap-1 bg-slate-900/80 backdrop-blur-sm border border-slate-700 rounded-md p-1" }, ['single', 'double', 'four-panel', 'sliding'].map(type => React.createElement('button', { key: type, onClick: () => setDoorType(type), className: `px-2 py-1 text-xs rounded capitalize ${doorType === type ? 'bg-cyan-500 text-slate-900' : 'hover:bg-slate-600'}` }, type))),
                        (mode === 'draw_arc' || mode === 'draw_circular_arc') && React.createElement('div', { className: "flex items-center gap-1 bg-slate-900/80 backdrop-blur-sm border border-slate-700 rounded-md p-1" }, ['single', 'double', 'dashed'].map(style => React.createElement('button', { key: style, onClick: () => setArcStyle(style), className: `px-2 py-1 text-xs rounded capitalize ${arcStyle === style ? 'bg-cyan-500 text-slate-900' : 'text-slate-300 hover:bg-slate-600'}` }, style))),
                        mode === 'draw_rectangle' && React.createElement('div', { className: "flex items-center gap-1 bg-slate-900/80 backdrop-blur-sm border border-slate-700 rounded-md p-1" }, ['single', 'double', 'dashed'].map(style => React.createElement('button', { key: style, onClick: () => setRectangleStyle(style), className: `px-2 py-1 text-xs rounded capitalize ${rectangleStyle === style ? 'bg-cyan-500 text-slate-900' : 'text-slate-300 hover:bg-slate-600'}` }, style)))
                    ),
                    React.createElement('div', { ref: canvasContainerRef, className: "relative w-full h-full flex items-center justify-center overflow-hidden touch-none", onMouseUp: handleMouseUp, onDrop: handleCanvasDrop, onDragOver: e => e.preventDefault() },
                      project ? React.createElement(Canvas, { svgRef, project, view, mode, isPanning, selectedWallId, selectedRoomId, selectedTextId, selectedFurnitureId, selectedArcId, selectedCircularArcId, selectedRectangleId, selectedDimensionLineId, selectedDoorId, selectedWindowId, drawingState, hoveredRoomPolygon, wallStyle, arcStyle, rectangleStyle, canvasContainerRef, cursorWorldPos, showGrid, showOriginAxes, traceImage, onWheel: handleWheel, onMouseDown: handleMouseDown, onMouseMove: handleMouseMove, onMouseLeave: handleMouseUp, onTouchStart: handleCanvasTouchStart, onTouchMove: handleCanvasTouchMove, onTouchEnd: handleCanvasTouchEnd })
                      : React.createElement('div', { className: "text-center text-slate-500" },
                          React.createElement('p', { className: "text-xl font-semibold" }, "Welcome to FloorPlan Lite"),
                          React.createElement('p', null, "Start by creating a ", React.createElement('button', { onClick: createNewProject, className: "text-cyan-400 hover:underline" }, "new project"), " or opening an existing one.")
                        ),
                      React.createElement('div', { className: "absolute bottom-4 right-4 flex flex-col items-center gap-2", 'data-export-ignore': "true" },
                        React.createElement('button', { onClick: () => setShowGrid(!showGrid), "aria-label": "Toggle Grid", title: "Toggle Grid", className: `w-10 h-10 rounded-md flex items-center justify-center hover:bg-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 ${showGrid ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-400'}` }, React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement('path', { d: "M3 3h18v18H3zM21 9H3M21 15H3M9 3v18M15 3v18" }))),
                        React.createElement('button', { onClick: () => setShowOriginAxes(!showOriginAxes), "aria-label": "Toggle Origin Axes", title: "Toggle Origin Axes", className: `w-10 h-10 rounded-md flex items-center justify-center hover:bg-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 ${showOriginAxes ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-400'}` }, React.createElement('svg', { xmlns: "http://www.w3.org/2000/svg", width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement('path', { d: "M12 20V4M20 12H4" }))),
                        React.createElement('div', { className: "w-full border-t border-slate-600 my-1" }),
                        React.createElement('button', { onClick: () => zoom('in'), "aria-label": "Zoom In", className: "w-10 h-10 bg-slate-700 text-white rounded-md flex items-center justify-center text-xl font-bold hover:bg-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500" }, "+"),
                        React.createElement('button', { onClick: () => zoom('out'), "aria-label": "Zoom Out", className: "w-10 h-10 bg-slate-700 text-white rounded-md flex items-center justify-center text-xl font-bold hover:bg-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500" }, "-")
                      )
                    ),
                    React.createElement('footer', { className: "flex-shrink-0 bg-slate-800 border-t border-slate-700 px-4 py-1 text-xs text-slate-400 flex justify-between" },
                      React.createElement('div', null, project?.units || 'mm'),
                      React.createElement('div', null, cursorWorldPos ? `X: ${cursorWorldPos.x.toFixed(0)}, Y: ${cursorWorldPos.y.toFixed(0)}` : '')
                    )
                ),
                React.createElement('aside', { className: `flex-shrink-0 bg-slate-800 border-l border-slate-700 transition-all duration-300 ease-in-out ${isInspectorOpen ? 'w-80' : 'w-0'}` },
                   React.createElement('div', { className: "overflow-y-auto overflow-x-hidden h-full w-80" },
                      React.createElement('div', { className: "p-4 space-y-4" },
                        mode === 'select' ?
                          (selectedItemExists ? (
                            React.createElement(PropertiesPanel, { 
                                selectedWall, selectedRoom, selectedText, selectedFurniture, 
                                selectedArc, selectedCircularArc, selectedRectangle,
                                selectedDimensionLine,
                                selectedDoor,
                                selectedWindow,
                                projectUnits: project?.units,
                                updateSelectedWall, updateSelectedWallLength, deleteSelectedItem, duplicateSelectedWall,
                                updateSelectedRoom, duplicateSelectedRoom,
                                updateSelectedText, duplicateSelectedText,
                                updateSelectedFurniture, duplicateSelectedFurniture,
                                updateSelectedArc, duplicateSelectedArc,
                                updateSelectedCircularArc, duplicateSelectedCircularArc,
                                updateSelectedRectangle, duplicateSelectedRectangle,
                                updateSelectedDimensionLine, updateSelectedDimensionLineLength, duplicateSelectedDimensionLine,
                                updateSelectedDoor, duplicateSelectedDoor,
                                updateSelectedWindow, duplicateSelectedWindow
                            })
                          ) : traceImage ? (
                            React.createElement(TraceImagePanel, { traceImage: traceImage, setTraceImage: setTraceImage })
                          ) : (
                            React.createElement(PropertiesPanel, { 
                                selectedWall: undefined, selectedRoom: undefined, selectedText: undefined, selectedFurniture: undefined, 
                                selectedArc: undefined, selectedCircularArc: undefined, selectedRectangle: undefined,
                                selectedDimensionLine: undefined,
                                selectedDoor: undefined,
                                selectedWindow: undefined,
                                projectUnits: project?.units,
                                updateSelectedWall, updateSelectedWallLength, deleteSelectedItem, duplicateSelectedWall,
                                updateSelectedRoom, duplicateSelectedRoom,
                                updateSelectedText, duplicateSelectedText,
                                updateSelectedFurniture, duplicateSelectedFurniture,
                                updateSelectedArc, duplicateSelectedArc,
                                updateSelectedCircularArc, duplicateSelectedCircularArc,
                                updateSelectedRectangle, duplicateSelectedRectangle,
                                updateSelectedDimensionLine, updateSelectedDimensionLineLength, duplicateSelectedDimensionLine,
                                updateSelectedDoor, duplicateSelectedDoor,
                                updateSelectedWindow, duplicateSelectedWindow
                            })
                          ))
                        : (
                          React.createElement(DrawPanel, null)
                        )
                      )
                    )
                )
            ),
            isPdfModalOpen && React.createElement('div', { className: "fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4", onClick: () => setIsPdfModalOpen(false), role: "dialog", "aria-modal": "true" },
                React.createElement('div', { className: "bg-slate-800 rounded-lg shadow-xl p-6 w-full max-w-md border border-slate-700", onClick: (e) => e.stopPropagation() },
                  React.createElement('h2', { className: "text-xl font-bold text-cyan-400 mb-6" }, "Export to PDF"),
                  React.createElement('div', { className: "space-y-4" },
                    React.createElement('div', { className: "grid grid-cols-2 gap-4" },
                      React.createElement('div', null, React.createElement('label', { htmlFor: "paperSize", className: "block text-slate-400 mb-1 text-sm" }, "Paper Size"), React.createElement('select', { id: "paperSize", name: "paperSize", value: pdfOptions.paperSize, onChange: handlePdfOptionChange, className: "w-full bg-slate-700 text-white rounded px-2 py-1.5 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500" }, React.createElement('option', { value: "a4" }, "A4"), React.createElement('option', { value: "a3" }, "A3"))),
                      React.createElement('div', null, React.createElement('label', { htmlFor: "orientation", className: "block text-slate-400 mb-1 text-sm" }, "Orientation"), React.createElement('select', { id: "orientation", name: "orientation", value: pdfOptions.orientation, onChange: handlePdfOptionChange, className: "w-full bg-slate-700 text-white rounded px-2 py-1.5 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500" }, React.createElement('option', { value: "l" }, "Landscape"), React.createElement('option', { value: "p" }, "Portrait")))
                    ),
                    React.createElement('div', null, React.createElement('label', { htmlFor: "projectName", className: "block text-slate-400 mb-1 text-sm" }, "Project Name"), React.createElement('input', { type: "text", id: "projectName", name: "projectName", value: pdfOptions.projectName, onChange: handlePdfOptionChange, className: "w-full bg-slate-700 text-white rounded px-2 py-1.5 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500" })),
                    React.createElement('div', null, React.createElement('label', { htmlFor: "designer", className: "block text-slate-400 mb-1 text-sm" }, "Designer"), React.createElement('input', { type: "text", id: "designer", name: "designer", value: pdfOptions.designer, onChange: handlePdfOptionChange, placeholder: "Enter designer name", className: "w-full bg-slate-700 text-white rounded px-2 py-1.5 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500" })),
                    React.createElement('div', null, React.createElement('label', { htmlFor: "date", className: "block text-slate-400 mb-1 text-sm" }, "Date"), React.createElement('input', { type: "text", id: "date", name: "date", value: pdfOptions.date, onChange: handlePdfOptionChange, className: "w-full bg-slate-700 text-white rounded px-2 py-1.5 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500" }))
                  ),
                  React.createElement('div', { className: "flex justify-end gap-3 mt-8" },
                    React.createElement('button', { onClick: () => setIsPdfModalOpen(false), className: "px-4 py-2 text-sm rounded-md font-semibold bg-slate-600 hover:bg-slate-500 text-white transition-colors" }, "Cancel"),
                    React.createElement('button', { onClick: handleExportPdf, className: "px-4 py-2 text-sm rounded-md font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors" }, "Generate PDF")
                  )
                )
            )
        );
    };

    // --- End of App.tsx ---

    // --- Start of index.tsx mounting logic ---
    const rootElement = document.getElementById('root');
    if (!rootElement) {
      throw new Error("Could not find root element to mount to");
    }
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      React.createElement(StrictMode, null, React.createElement(App, null))
    );
    // --- End of index.tsx mounting logic ---
})();