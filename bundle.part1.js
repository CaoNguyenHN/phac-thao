
(function () {
    'use strict';

    const { useState, useRef, useCallback, useEffect, useMemo } = React;

    const Units = {
        MM: 'mm',
        IN: 'in',
        FT: 'ft',
    };

    // --- Start of utils/helpers.ts ---

    const pointToSegmentDistance = (px, py, x1, y1, x2, y2) => {
        const l2 = (x1 - x2) ** 2 + (y1 - y2) ** 2;
        if (l2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
        let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
        t = Math.max(0, Math.min(1, t));
        const dx = x1 + t * (x2 - x1) - px;
        const dy = y1 + t * (y2 - y1) - py;
        return Math.sqrt(dx ** 2 + dy ** 2);
    };

    const findClosestPointOnSegment = (px, py, x1, y1, x2, y2) => {
        const l2 = (x1 - x2) ** 2 + (y1 - y2) ** 2;
        if (l2 === 0) return { x: x1, y: y1, t: 0, dist: Math.sqrt((px-x1)**2 + (py-y1)**2) };
        let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
        t = Math.max(0, Math.min(1, t));
        const x = x1 + t * (x2 - x1);
        const y = y1 + t * (y2 - y1);
        const dist = Math.sqrt((px-x)**2 + (py-y)**2);
        return { x, y, t, dist };
    };

    const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
        const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
        return {
            x: centerX + (radius * Math.cos(angleInRadians)),
            y: centerY + (radius * Math.sin(angleInRadians))
        };
    };

    const generateCircularArcPath = (arc) => {
        if (arc.radius <= 0) return "";
        
        const angleDiff = Math.abs(arc.endAngle - arc.startAngle);
        if (angleDiff % 360 === 0 && angleDiff !== 0) { // Check for full circle
            const p1 = polarToCartesian(arc.cx, arc.cy, arc.radius, arc.startAngle);
            const p2 = polarToCartesian(arc.cx, arc.cy, arc.radius, arc.startAngle + 180);
            return `M ${p1.x} ${p1.y} A ${arc.radius} ${arc.radius} 0 1 1 ${p2.x} ${p2.y} A ${arc.radius} ${arc.radius} 0 1 1 ${p1.x} ${p1.y}`;
        }

        const start = polarToCartesian(arc.cx, arc.cy, arc.radius, arc.startAngle);
        const end = polarToCartesian(arc.cx, arc.cy, arc.radius, arc.endAngle);
        
        let largeArcFlag = "0";
        let sweepFlag = "1";

        let normalizedEnd = arc.endAngle;
        if (normalizedEnd < arc.startAngle) {
            normalizedEnd += 360;
        }
        if (normalizedEnd - arc.startAngle > 180) {
            largeArcFlag = "1";
        }

        return `M ${start.x} ${start.y} A ${arc.radius} ${arc.radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`;
    };

    const calculatePolygonArea = (points) => {
        let area = 0;
        const n = points.length;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += points[i].x * points[j].y;
            area -= points[j].x * points[i].y;
        }
        return Math.abs(area / 2);
    };

    const calculatePolygonCentroid = (points) => {
        let cx = 0, cy = 0, signedArea = 0;
        const n = points.length;
        if (n === 0) return { x: 0, y: 0 };
        for (let i = 0; i < n; i++) {
            const x0 = points[i].x, y0 = points[i].y;
            const x1 = points[(i + 1) % n].x, y1 = points[(i + 1) % n].y;
            const a = x0 * y1 - x1 * y0;
            signedArea += a;
            cx += (x0 + x1) * a;
            cy += (y0 + y1) * a;
        }

        if (Math.abs(signedArea) < 1e-6) {
            let avgX = 0, avgY = 0;
            for (const p of points) {
                avgX += p.x;
                avgY += p.y;
            }
            return { x: avgX / n, y: avgY / n };
        }

        signedArea *= 0.5;
        cx /= (6 * signedArea);
        cy /= (6 * signedArea);
        return { x: cx, y: cy };
    };

    const isPointInPolygon = (point, polygon) => {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;
            const intersect = ((yi > point.y) !== (yj > point.y)) &&
                (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    };

    const EPSILON = 1e-6;

    const findIntersection = (x1, y1, x2, y2, x3, y3, x4, y4) => {
        const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(den) < EPSILON) return null;

        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;

        if (t >= -EPSILON && t <= 1 + EPSILON && u >= -EPSILON && u <= 1 + EPSILON) {
            return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
        }
        return null;
    }

    const pointKey = (p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`;

    const findRoomFromPoint = (startPoint, walls, existingRooms) => {
        if (!walls.length) return null;
        if (existingRooms.some(room => isPointInPolygon(startPoint, room.points))) return null;

        const nodes = new Map();
        const getOrCreateNode = (p) => {
            const key = pointKey(p);
            if (!nodes.has(key)) {
                nodes.set(key, { x: p.x, y: p.y, edges: [] });
            }
            return nodes.get(key);
        };

        walls.forEach(wall => {
            getOrCreateNode({ x: wall.x1, y: wall.y1 });
            getOrCreateNode({ x: wall.x2, y: wall.y2 });
        });

        for (let i = 0; i < walls.length; i++) {
            for (let j = i + 1; j < walls.length; j++) {
                const w1 = walls[i], w2 = walls[j];
                const intersection = findIntersection(w1.x1, w1.y1, w1.x2, w1.y2, w2.x1, w2.y1, w2.x2, w2.y2);
                if (intersection) getOrCreateNode(intersection);
            }
        }

        const edges = [];
        walls.forEach(wall => {
            const pointsOnWall = [];
            nodes.forEach(node => {
                if (pointToSegmentDistance(node.x, node.y, wall.x1, wall.y1, wall.x2, wall.y2) < EPSILON) {
                    pointsOnWall.push({ x: node.x, y: node.y });
                }
            });
            
            pointsOnWall.sort((a, b) => ((a.x - wall.x1) ** 2 + (a.y - wall.y1) ** 2) - ((b.x - wall.x1) ** 2 + (b.y - wall.y1) ** 2));

            for (let i = 0; i < pointsOnWall.length - 1; i++) {
                const p1 = pointsOnWall[i], p2 = pointsOnWall[i+1];
                if (Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2) < EPSILON) continue;

                const node1 = getOrCreateNode(p1);
                const node2 = getOrCreateNode(p2);
                const edge = { node1, node2, wall };
                
                node1.edges.push(edge);
                node2.edges.push(edge);
                edges.push(edge);
            }
        });

        let startingEdge = null;
        let minDistance = Infinity;
        const rayEndPoint = { x: startPoint.x + 1e6, y: startPoint.y + 1e-4 };
        
        for (const edge of edges) {
            const intersection = findIntersection(startPoint.x, startPoint.y, rayEndPoint.x, rayEndPoint.y, edge.node1.x, edge.node1.y, edge.node2.x, edge.node2.y);
            if (intersection) {
                const distance = Math.sqrt((intersection.x - startPoint.x) ** 2 + (intersection.y - startPoint.y)**2);
                if (distance < minDistance) {
                    minDistance = distance;
                    startingEdge = edge;
                }
            }
        }
        
        if (!startingEdge) return null;

        const polygon = [];
        let prevNode, currentNode;
        
        const wallVector = { x: startingEdge.node2.x - startingEdge.node1.x, y: startingEdge.node2.y - startingEdge.node1.y };
        const pointVector = { x: startPoint.x - startingEdge.node1.x, y: startPoint.y - startingEdge.node1.y };
        const crossProduct = wallVector.x * pointVector.y - wallVector.y * pointVector.x;
       
        if (crossProduct > 0) {
            currentNode = startingEdge.node2;
            prevNode = startingEdge.node1;
        } else {
            currentNode = startingEdge.node1;
            prevNode = startingEdge.node2;
        }
        const startNode = currentNode;

        for (let i = 0; i < nodes.size + 1; i++) {
            polygon.push(currentNode);

            const incomingVector = { x: currentNode.x - prevNode.x, y: currentNode.y - prevNode.y };
            const incomingAngle = Math.atan2(incomingVector.y, incomingVector.x);

            let bestNextNode = null;
            let maxAngleDiff = -Infinity; 

            for (const edge of currentNode.edges) {
                const nextNode = (edge.node1 === currentNode) ? edge.node2 : edge.node1;
                if (nextNode === prevNode) continue;

                const outgoingVector = { x: nextNode.x - currentNode.x, y: nextNode.y - currentNode.y };
                const outgoingAngle = Math.atan2(outgoingVector.y, outgoingVector.x);
                
                let angleDiff = outgoingAngle - incomingAngle;
                while (angleDiff < 0) angleDiff += 2 * Math.PI;
                while (angleDiff >= 2 * Math.PI) angleDiff -= 2 * Math.PI;

                let rightTurnAngle = angleDiff;
                if (rightTurnAngle > Math.PI) {
                    rightTurnAngle = rightTurnAngle - 2 * Math.PI;
                }

                if (rightTurnAngle > maxAngleDiff) {
                    maxAngleDiff = rightTurnAngle;
                    bestNextNode = nextNode;
                }
            }
            
            if (!bestNextNode) return null;

            prevNode = currentNode;
            currentNode = bestNextNode;
            
            if (currentNode === startNode) break;
        }

        if (currentNode !== startNode || polygon.length < 3) return null;
        
        const polygonPoints = polygon.map(n => ({ x: n.x, y: n.y }));

        if (!isPointInPolygon(startPoint, polygonPoints)) return null;
        
        let signedArea = 0;
        for (let i = 0; i < polygonPoints.length; i++) {
            const p1 = polygonPoints[i];
            const p2 = polygonPoints[(i + 1) % polygonPoints.length];
            signedArea += (p1.x * p2.y - p2.x * p1.y);
        }
        if (signedArea < 0) return null;

        return { points: polygonPoints };
    };

    // --- End of utils/helpers.ts ---

    // --- Start of furniture-library.tsx ---
    
    const FURNITURE_SHAPE_MAP = {
      'living-set-1': [ { type: 'path', d: 'M 5 0 L 55 0 C 57.77 0 60 2.23 60 5 L 60 60 C 60 62.77 57.77 65 55 65 L 5 65 C 2.23 65 0 62.77 0 60 L 0 5 C 0 2.23 2.23 0 5 0 Z M 5 5 L 5 60 L 10 60 L 10 10 L 50 10 L 50 60 L 55 60 L 55 5 Z' }, { type: 'circle', cx: 80, cy: 32.5, r: 15 }, { type: 'path', d: 'M 105 0 L 155 0 C 157.77 0 160 2.23 160 5 L 160 60 C 160 62.77 157.77 65 155 65 L 105 65 C 102.23 65 100 62.77 100 60 L 100 5 C 100 2.23 102.23 0 105 0 Z M 105 5 L 105 60 L 110 60 L 110 10 L 150 10 L 150 60 L 155 60 L 155 5 Z' }, ],
      'living-set-2': [ { type: 'path', d: 'M 5 0 L 55 0 C 57.77 0 60 2.23 60 5 L 60 60 C 60 62.77 57.77 65 55 65 L 5 65 C 2.23 65 0 62.77 0 60 L 0 5 C 0 2.23 2.23 0 5 0 Z M 5 5 L 5 60 L 10 60 L 10 10 L 50 10 L 50 60 L 55 60 L 55 5 Z' }, { type: 'rect', x: 70, y: 17.5, width: 30, height: 30, rx: 2 }, { type: 'path', d: 'M 115 0 L 165 0 C 167.77 0 170 2.23 170 5 L 170 60 C 170 62.77 167.77 65 165 65 L 115 65 C 112.23 65 110 62.77 110 60 L 110 5 C 110 2.23 112.23 0 115 0 Z M 115 5 L 115 60 L 120 60 L 120 10 L 160 10 L 160 60 L 165 60 L 165 5 Z' }, ],
      'sofa-2-seater-b': [ { type: 'path', d: 'M 5 0 L 135 0 C 137.77 0 140 2.23 140 5 L 140 60 C 140 62.77 137.77 65 135 65 L 5 65 C 2.23 65 0 62.77 0 60 L 0 5 C 0 2.23 2.23 0 5 0 Z M 5 5 L 5 60 L 10 60 L 10 10 L 130 10 L 130 60 L 135 60 L 135 5 Z' }, { type: 'path', d: 'M 70 10 L 70 60' }, ],
     'living-set-curved': [ { type: 'path', d: 'M 0 55 L 0 25 A 30 30 0 0 1 60 25 L 60 55 Z' }, { type: 'path', d: 'M 6 55 L 6 25 A 24 24 0 0 1 54 25 L 54 55 Z' }, { type: 'path', d: 'M 8 55 L 8 25 A 18 18 0 0 1 52 25 L 52 55 Z' }, { type: 'circle', cx: 84, cy: 27.5, r: 14 }, { type: 'path', d: 'M 108 55 L 108 25 A 30 30 0 0 1 168 25 L 168 55 Z' }, { type: 'path', d: 'M 114 55 L 114 25 A 24 24 0 0 1 162 25 L 162 55 Z' }, { type: 'path', d: 'M 116 55 L 116 25 A 18 18 0 0 1 160 25 L 160 55 Z' }, ],
      'armchair-b': [ { type: 'path', d: 'M 5 0 L 55 0 C 57.77 0 60 2.23 60 5 L 60 60 C 60 62.77 57.77 65 55 65 L 5 65 C 2.23 65 0 62.77 0 60 L 0 5 C 0 2.23 2.23 0 5 0 Z M 5 5 L 5 60 L 10 60 L 10 10 L 50 10 L 50 60 L 55 60 L 55 5 Z' }, ],
      'sofa-3-seater-b': [ { type: 'path', d: 'M 5 0 L 175 0 C 177.77 0 180 2.23 180 5 L 180 60 C 180 62.77 177.77 65 175 65 L 5 65 C 2.23 65 0 62.77 0 60 L 0 5 C 0 2.23 2.23 0 5 0 Z M 5 5 L 5 60 L 10 60 L 10 10 L 170 10 L 170 60 L 175 60 L 175 5 Z' }, { type: 'path', d: 'M 60 10 L 60 60 M 120 10 L 120 60' }, ],
      'sofa-l-corner-b': [ { type: 'path', d: 'M 5 0 L 145 0 C 147.77 0 150 2.23 150 5 L 150 65 C 150 67.77 147.77 70 145 70 L 70 70 L 70 145 C 70 147.77 67.77 150 65 150 L 5 150 C 2.23 150 0 147.77 0 145 L 0 5 C 0 2.23 2.23 0 5 0 Z M 5 5 L 5 145 L 65 145 L 65 65 L 145 65 L 145 5 Z' }, { type: 'path', d: 'M 5 65 L 65 65 M 65 5 L 65 65 M 105 5 L 105 65 M 65 105 L 5 105' }, ],
      'sofa-chaise-lounge': [ { type: 'path', d: 'M 5 0 L 185 0 C 187.77 0 190 2.23 190 5 L 190 60 C 190 62.77 187.77 65 185 65 L 70 65 L 70 135 C 70 137.77 67.77 140 65 140 L 5 140 C 2.23 140 0 137.77 0 135 L 0 5 C 0 2.23 2.23 0 5 0 Z' }, { type: 'path', d: 'M 5 5 L 5 135 L 65 135 L 65 60 L 185 60 L 185 5 Z' }, { type: 'path', d: 'M 5 45 L 65 45 M 5 90 L 65 90 M 65 5 L 65 60 M 125 5 L 125 60' }, { type: 'rect', x: 80, y: 80, width: 100, height: 50, rx: 4}, ],
      'media-console': [ { type: 'rect', x: 0, y: 0, width: 40, height: 100, rx: 5 }, { type: 'path', d: 'M 5 50 L 35 50' }, { type: 'circle', cx: 20, cy: 50, r: 8 }, { type: 'path', d: 'M 20 45 L 20 55'}, ],
      'living-set-angled': [ { type: 'path', d: 'M 5 0 L 175 0 C 180 0 180 5 180 5 L 180 60 C 180 65 175 65 175 65 L 5 65 C 0 65 0 60 0 60 L 0 5 C 0 0 5 0 5 0 Z M 10 10 L 170 10 L 170 60 L 10 60 Z' }, { type: 'path', d: 'M 63 10 L 63 60 M 117 10 L 117 60' }, { type: 'rect', x: 30, y: 80, width: 120, height: 50, rx: 4 }, { type: 'path', d: 'M 5 0 L 55 0 C 57.77 0 60 2.23 60 5 L 60 60 C 60 62.77 57.77 65 55 65 L 5 65 C 2.23 65 0 62.77 0 60 L 0 5 C 0 2.23 2.23 0 5 0 Z M 5 5 L 5 60 L 10 60 L 10 10 L 50 10 L 50 60 L 55 60 L 55 5 Z', transform: 'translate(0, 150) rotate(200 30 32.5)' }, { type: 'path', d: 'M 5 0 L 55 0 C 57.77 0 60 2.23 60 5 L 60 60 C 60 62.77 57.77 65 55 65 L 5 65 C 2.23 65 0 62.77 0 60 L 0 5 C 0 2.23 2.23 0 5 0 Z M 5 5 L 5 60 L 10 60 L 10 10 L 50 10 L 50 60 L 55 60 L 55 5 Z', transform: 'translate(140, 150) rotate(160 30 32.5)' }, ],
    };
    
    const FURNITURE_LIBRARY = {
        'Living Room': [ { id: 'living-set-1', name: 'Armchair Set' }, { id: 'living-set-2', name: 'Armchair Set 2' }, { id: 'sofa-2-seater-b', name: 'Sofa (2-seat)' }, { id: 'living-set-curved', name: 'Curved Chairs' }, { id: 'armchair-b', name: 'Armchair' }, { id: 'sofa-3-seater-b', name: 'Sofa (3-seat)' }, { id: 'sofa-l-corner-b', name: 'Corner Sofa' }, { id: 'sofa-chaise-lounge', name: 'Chaise Sofa Set' }, { id: 'living-set-angled', name: 'Sofa Set Angled' }, { id: 'media-console', name: 'Side Table' }, ],
    };
    
    const FURNITURE_DIMENSIONS = {
      'living-set-1': { width: 160, height: 65 }, 'living-set-2': { width: 170, height: 65 }, 'sofa-2-seater-b': { width: 140, height: 65 }, 'living-set-curved': { width: 168, height: 55 }, 'armchair-b': { width: 60, height: 65 }, 'sofa-3-seater-b': { width: 180, height: 65 }, 'sofa-l-corner-b': { width: 150, height: 150 }, 'sofa-chaise-lounge': { width: 190, height: 140 }, 'media-console': { width: 40, height: 100 }, 'living-set-angled': { width: 200, height: 220 },
    };
    
    const FurnitureRenderer = ({ type, thickness }) => {
      const shapes = FURNITURE_SHAPE_MAP[type] || [];
      return (
        //React.createElement('g', { stroke: "currentColor", fill: "none", strokeWidth: thickness, strokeLinecap: "round", strokeLinejoin: "round" },
		React.createElement('g', { stroke: "currentColor", fill: "currentColor", fillOpacity: "0.2", strokeWidth: thickness, strokeLinecap: "round", strokeLinejoin: "round" },
          shapes.map((shape, i) => {
            let element;
            if (shape.type === 'rect') {
              element = React.createElement('rect', { key: i, x: shape.x, y: shape.y, width: shape.width, height: shape.height, rx: shape.rx || 0 });
            } else if (shape.type === 'circle') {
              element = React.createElement('circle', { key: i, cx: shape.cx, cy: shape.cy, r: shape.r });
            } else if (shape.type === 'path') {
              element = React.createElement('path', { key: i, d: shape.d });
            } else {
              return null;
            }
    
            if (shape.transform) {
              return React.createElement('g', { key: i, transform: shape.transform }, element);
            }
            
            return element;
          })
        )
      );
    };

    // --- End of furniture-library.tsx ---

    // --- Start of components/ActionButton.tsx ---

    const ActionButton = ({ onClick, children, className, disabled, title }) => (
      React.createElement('button', {
        onClick: onClick,
        disabled: disabled,
        title: title,
        className: `px-4 py-2 text-sm rounded-md font-semibold transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed ${className}`
      }, children)
    );

    // --- End of components/ActionButton.tsx ---

    // --- Start of components/FurnitureLibraryUI.tsx ---

    const FurnitureLibraryUI = ({ onDragStart, onSelect, placingFurnitureType }) => {
        const [activeCategory, setActiveCategory] = useState(Object.keys(FURNITURE_LIBRARY)[0]);
        return (
            React.createElement('div', { className: "bg-slate-900 rounded-lg border border-slate-700 flex flex-col h-full" },
                React.createElement('div', { className: "flex border-b border-slate-700" },
                    Object.keys(FURNITURE_LIBRARY).map(category => (
                        React.createElement('button', { key: category, onClick: () => setActiveCategory(category),
                            className: `flex-1 p-2 text-sm font-semibold transition-colors ${activeCategory === category ? 'bg-slate-700 text-cyan-400' : 'text-slate-400 hover:bg-slate-800'}`},
                            category
                        )
                    ))
                ),
                React.createElement('div', { className: "p-2 grid grid-cols-3 gap-2 overflow-y-auto" },
                    FURNITURE_LIBRARY[activeCategory].map(item => {
                        const dims = FURNITURE_DIMENSIONS[item.id];
                        if (!dims) return null;
                        const isPlacing = placingFurnitureType === item.id;
                        return (
                            React.createElement('div', { key: item.id, 
                                 draggable: true, 
                                 onDragStart: (e) => onDragStart(e, item.id),
                                 onClick: () => onSelect(item.id),
                                 className: `bg-slate-800 p-1 rounded-md flex flex-col items-center justify-center cursor-grab active:cursor-grabbing hover:bg-slate-700 transition-all aspect-square ${isPlacing ? 'ring-2 ring-cyan-400' : 'hover:ring-2 ring-cyan-500'}`},
                                React.createElement('div', { className: "w-full h-full text-slate-300" },
                                    React.createElement('svg', { viewBox: `0 0 ${dims.width} ${dims.height}`, width: "100%", height: "100%", preserveAspectRatio: "xMidYMid meet" },
                                        // React.createElement(FurnitureRenderer, { type: item.id, thickness: dims.width / 20 })
										React.createElement(FurnitureRenderer, { type: item.id, thickness: 2.5 })
                                    )
                                ),
                                React.createElement('span', { className: "text-xs text-slate-400 mt-1 text-center" }, item.name)
                            )
                        );
                    })
                )
            )
        );
    };

    // --- End of components/FurnitureLibraryUI.tsx ---

    // --- Start of components/TraceImagePanel.tsx ---

    const TraceImagePanel = ({ traceImage, setTraceImage }) => {
      if (!traceImage) return null;

      const handleUpdate = (prop, value) => {
        setTraceImage(prev => {
          if (!prev) return null;
          const newImage = { ...prev, [prop]: value };
          if (prop === 'width') {
            newImage.height = value / newImage.aspectRatio;
          }
          return newImage;
        });
      };

      return React.createElement('div', { 'data-export-ignore': 'true' },
        React.createElement('h3', { className: 'text-lg font-semibold text-slate-300 mb-3' }, 'Trace Image'),
        React.createElement('div', { className: 'space-y-3 text-sm' },
          React.createElement('div', { className: 'flex items-center justify-between' },
            React.createElement('label', { htmlFor: 'traceVisible', className: 'text-slate-400' }, 'Visible'),
            React.createElement('input', {
              type: 'checkbox',
              id: 'traceVisible',
              checked: traceImage.visible,
              onChange: (e) => handleUpdate('visible', e.target.checked),
              className: 'h-4 w-4 rounded bg-slate-700 border-slate-600 text-cyan-500 focus:ring-cyan-500'
            })
          ),
          React.createElement('div', null,
            React.createElement('label', { htmlFor: 'traceOpacity', className: 'block text-slate-400 mb-1' }, `Opacity: ${Math.round(traceImage.opacity * 100)}%`),
            React.createElement('input', {
              type: 'range',
              id: 'traceOpacity',
              min: '0',
              max: '1',
              step: '0.05',
              value: traceImage.opacity,
              onChange: (e) => handleUpdate('opacity', parseFloat(e.target.value)),
              className: 'w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer'
            })
          ),
          React.createElement('div', { className: 'grid grid-cols-2 gap-2' },
            React.createElement('div', null,
              React.createElement('label', { htmlFor: 'traceX', className: 'block text-slate-400 mb-1' }, 'X'),
              React.createElement('input', {
                type: 'number',
                id: 'traceX',
                value: traceImage.x.toFixed(0),
                onChange: (e) => handleUpdate('x', parseFloat(e.target.value) || 0),
                className: 'w-full bg-slate-700 text-white rounded px-2 py-1 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500'
              })
            ),
            React.createElement('div', null,
              React.createElement('label', { htmlFor: 'traceY', className: 'block text-slate-400 mb-1' }, 'Y'),
              React.createElement('input', {
                type: 'number',
                id: 'traceY',
                value: traceImage.y.toFixed(0),
                onChange: (e) => handleUpdate('y', parseFloat(e.target.value) || 0),
                className: 'w-full bg-slate-700 text-white rounded px-2 py-1 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500'
              })
            )
          ),
          React.createElement('div', null,
            React.createElement('label', { htmlFor: 'traceWidth', className: 'block text-slate-400 mb-1' }, 'Width'),
            React.createElement('input', {
              type: 'number',
              id: 'traceWidth',
              value: traceImage.width.toFixed(0),
              onChange: (e) => handleUpdate('width', parseFloat(e.target.value) || 0),
              className: 'w-full bg-slate-700 text-white rounded px-2 py-1 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500'
            })
          )
        ),
        React.createElement('button', {
          onClick: () => setTraceImage(null),
          className: 'w-full mt-4 px-4 py-1.5 text-sm rounded-md font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors'
        }, 'Remove Image')
      );
    };

    // --- End of components/TraceImagePanel.tsx ---

    // --- Start of components/PropertiesPanel.tsx ---

    const WallProperties = ({ selectedWall, projectUnits, updateSelectedWall, updateSelectedWallLength, deleteSelectedItem, duplicateSelectedWall }) => {
        const [lengthValue, setLengthValue] = useState('');
        const [thicknessValue, setThicknessValue] = useState('');
    
        const derivedLength = useMemo(() => {
            const { x1, y1, x2, y2 } = selectedWall;
            return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        }, [selectedWall]);
    
        useEffect(() => {
            if (selectedWall) {
                setLengthValue(derivedLength.toFixed(1));
                setThicknessValue(selectedWall.thickness.toString());
            }
        }, [selectedWall, derivedLength]);
    
        const handleLengthBlur = () => {
            const newLength = parseFloat(lengthValue);
            if (!isNaN(newLength) && newLength.toFixed(1) !== derivedLength.toFixed(1)) {
                updateSelectedWallLength(newLength);
            } else {
                setLengthValue(derivedLength.toFixed(1));
            }
        };
    
        const handleThicknessBlur = () => {
            if (!selectedWall) return;
            const newThickness = parseFloat(thicknessValue);
            if (!isNaN(newThickness) && newThickness !== selectedWall.thickness) {
                updateSelectedWall("thickness", newThickness);
            } else {
                setThicknessValue(selectedWall.thickness.toString());
            }
        };
    
        return (
            React.createElement('div', null,
                React.createElement('h3', { className: "text-lg font-semibold text-slate-300 mb-3" }, "Wall Properties"),
                React.createElement('div', { className: "space-y-3 text-sm" },
                    React.createElement('div', null,
                        React.createElement('label', { htmlFor: "wallLength", className: "block text-slate-400 mb-1" }, `Length (${projectUnits})`),
                        React.createElement('input', { type: "number", id: "wallLength", value: lengthValue,
                               onChange: (e) => setLengthValue(e.target.value),
                               onBlur: handleLengthBlur,
                               onKeyDown: (e) => e.key === 'Enter' && e.target.blur(),
                               className: "w-full bg-slate-700 text-white rounded px-2 py-1 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500"})
                    ),
                    React.createElement('div', null,
                        React.createElement('label', { htmlFor: "wallThickness", className: "block text-slate-400 mb-1" }, `Thickness (${projectUnits})`),
                        React.createElement('input', { type: "number", id: "wallThickness", value: thicknessValue,
                               onChange: (e) => setThicknessValue(e.target.value),
                               onBlur: handleThicknessBlur,
                               onKeyDown: (e) => e.key === 'Enter' && e.target.blur(),
                               className: "w-full bg-slate-700 text-white rounded px-2 py-1 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500"})
                    ),
                    React.createElement('div', null,
                        React.createElement('label', { htmlFor: "wallStyle", className: "block text-slate-400 mb-1" }, "Style"),
                        React.createElement('select', { id: "wallStyle", value: selectedWall.style || 'double',
                                onChange: (e) => updateSelectedWall('style', e.target.value),
                                className: "w-full bg-slate-700 text-white rounded px-2 py-1 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500"},
                            React.createElement('option', { value: "single" }, "Single"),
                            React.createElement('option', { value: "double" }, "Double"),
                            React.createElement('option', { value: "dashed" }, "Dashed")
                        )
                    )
                ),
                React.createElement('div', { className: "flex gap-2 mt-4" },
                    React.createElement('button', { onClick: duplicateSelectedWall, className: "w-full px-4 py-2 text-sm rounded-md font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors" }, "Duplicate"),
                    React.createElement('button', { onClick: deleteSelectedItem, className: "w-full px-4 py-2 text-sm rounded-md font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors" }, "Delete Wall")
                )
            )
        );
    };
    
    const RoomProperties = ({ selectedRoom, projectUnits, updateSelectedRoom, deleteSelectedItem, duplicateSelectedRoom }) => {
        const area = useMemo(() => calculatePolygonArea(selectedRoom.points), [selectedRoom.points]);
        const areaUnit = projectUnits === 'mm' ? 'm' : projectUnits;
        const conversionFactor = projectUnits === 'mm' ? 1/1000000 : projectUnits === 'in' ? 1/144 : 1;
        const displayArea = (area * conversionFactor).toFixed(2);
        
        return (
            React.createElement('div', null,
                React.createElement('h3', { className: "text-lg font-semibold text-slate-300 mb-3" }, "Room Properties"),
                React.createElement('div', { className: "space-y-3 text-sm" },
                    React.createElement('div', null,
                        React.createElement('label', { htmlFor: "roomName", className: "block text-slate-400 mb-1" }, "Name"),
                        React.createElement('input', { type: "text", id: "roomName", value: selectedRoom.name,
                               onChange: (e) => updateSelectedRoom('name', e.target.value),
                               className: "w-full bg-slate-700 text-white rounded px-2 py-1 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500"})
                    ),
                    React.createElement('div', null,
                        React.createElement('label', { htmlFor: "roomColor", className: "block text-slate-400 mb-1" }, "Color"),
                        React.createElement('input', { type: "color", id: "roomColor", value: selectedRoom.color,
                               onChange: (e) => updateSelectedRoom('color', e.target.value),
                               className: "w-full h-8 bg-slate-700 border border-slate-600 rounded cursor-pointer"})
                    ),
                     React.createElement('div', null,
                        React.createElement('p', { className: "block text-slate-400 mb-1" }, "Area"),
                        React.createElement('p', { className: "w-full bg-slate-800 text-slate-300 rounded px-2 py-1 " }, `${displayArea} ${areaUnit}²`)
                    )
                ),
                React.createElement('div', { className: "flex gap-2 mt-4" },
                    React.createElement('button', { onClick: duplicateSelectedRoom, className: "w-full px-4 py-2 text-sm rounded-md font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors" }, "Duplicate"),
                    React.createElement('button', { onClick: deleteSelectedItem, className: "w-full px-4 py-2 text-sm rounded-md font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors" }, "Delete Room")
                )
            )
        );
    };
    
    
    const TextProperties = ({ selectedText, updateSelectedText, deleteSelectedItem, duplicateSelectedText }) => {
        const [textValue, setTextValue] = useState('');
        const [fontSizeValue, setFontSizeValue] = useState('');
        const [rotationValue, setRotationValue] = useState('');
    
        useEffect(() => {
            if (selectedText) {
                setTextValue(selectedText.text);
                setFontSizeValue(selectedText.fontSize.toString());
                setRotationValue(selectedText.rotation.toString());
            }
        }, [selectedText]);
    
        const handleTextBlur = () => {
            if (selectedText && textValue !== selectedText.text) {
                updateSelectedText("text", textValue);
            }
        };
    
        const handleFontSizeBlur = () => {
            const newSize = parseFloat(fontSizeValue);
            if (selectedText && !isNaN(newSize) && newSize !== selectedText.fontSize) {
                updateSelectedText("fontSize", newSize);
            } else if (selectedText) {
                setFontSizeValue(selectedText.fontSize.toString());
            }
        };
    
        const handleRotationBlur = () => {
            const newRotation = parseFloat(rotationValue);
            if (selectedText && !isNaN(newRotation) && newRotation !== selectedText.rotation) {
                updateSelectedText("rotation", newRotation);
            } else if (selectedText) {
                setRotationValue(selectedText.rotation.toString());
            }
        };
    
        return (
            React.createElement('div', null,
                React.createElement('h3', { className: "text-lg font-semibold text-slate-300 mb-3" }, "Text Properties"),
                React.createElement('div', { className: "space-y-3 text-sm" },
                    React.createElement('div', null,
                        React.createElement('label', { htmlFor: "textContent", className: "block text-slate-400 mb-1" }, "Text"),
                        React.createElement('input', { type: "text", id: "textContent", value: textValue,
                               onChange: (e) => setTextValue(e.target.value),
                               onBlur: handleTextBlur,
                               onKeyDown: (e) => e.key === 'Enter' && e.target.blur(),
                               className: "w-full bg-slate-700 text-white rounded px-2 py-1 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500"})
                    ),
                    React.createElement('div', null,
                        React.createElement('label', { htmlFor: "fontSize", className: "block text-slate-400 mb-1" }, "Font Size"),
                        React.createElement('input', { type: "number", id: "fontSize", value: fontSizeValue,
                               onChange: (e) => setFontSizeValue(e.target.value),
                               onBlur: handleFontSizeBlur,
                               onKeyDown: (e) => e.key === 'Enter' && e.target.blur(),
                               className: "w-full bg-slate-700 text-white rounded px-2 py-1 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500"})
                    ),
                    React.createElement('div', null,
                        React.createElement('label', { htmlFor: "textRotation", className: "block text-slate-400 mb-1" }, "Rotation (deg)"),
                        React.createElement('input', { type: "number", id: "textRotation", value: rotationValue,
                               onChange: (e) => setRotationValue(e.target.value),
                               onBlur: handleRotationBlur,
                               onKeyDown: (e) => e.key === 'Enter' && e.target.blur(),
                               className: "w-full bg-slate-700 text-white rounded px-2 py-1 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500"})
                    )
                ),
                React.createElement('div', { className: "flex gap-2 mt-4" },
                    React.createElement('button', { onClick: duplicateSelectedText, className: "w-full px-4 py-2 text-sm rounded-md font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors" }, "Duplicate"),
                    React.createElement('button', { onClick: deleteSelectedItem, className: "w-full px-4 py-2 text-sm rounded-md font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors" }, "Delete Text")
                )
            )
        );
    };
    
    const FurnitureProperties = ({ selectedFurniture, updateSelectedFurniture, deleteSelectedItem, duplicateSelectedFurniture }) => {
        const [values, setValues] = useState({ x: '', y: '', scaleX: '', scaleY: '', rotation: '', thickness: '' });
    
        useEffect(() => {
            if (selectedFurniture) {
                setValues({
                    x: selectedFurniture.x.toFixed(1),
                    y: selectedFurniture.y.toFixed(1),
                    scaleX: selectedFurniture.scaleX.toFixed(2),
                    scaleY: selectedFurniture.scaleY.toFixed(2),
                    rotation: selectedFurniture.rotation.toFixed(1),
                    thickness: (selectedFurniture.thickness || 2).toFixed(1),
                });
            }
        }, [selectedFurniture]);
    
        const handleBlur = (prop) => () => {
            const newValue = parseFloat(values[prop]);
            const key = prop;
    
            const format = (v) => {
                if (key === 'scaleX' || key === 'scaleY') return v.toFixed(2);
                return v.toFixed(1);
            }
    
            if (selectedFurniture && !isNaN(newValue) && format(newValue) !== format(selectedFurniture[key])) {
                updateSelectedFurniture(prop, newValue);
            } else if (selectedFurniture) {
                setValues(prev => ({ ...prev, [prop]: format(selectedFurniture[key]) }));
            }
        };
        
        const handleChange = (prop) => (e) => {
            setValues(prev => ({...prev, [prop]: e.target.value}));
        }
    
        const fields = ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'thickness'];
    
        return (
            React.createElement('div', null,
                React.createElement('h3', { className: "text-lg font-semibold text-slate-300 mb-3" }, "Furniture Properties"),
                React.createElement('div', { className: "grid grid-cols-2 gap-3 text-sm" },
                    fields.map(prop => (
                        React.createElement('div', { key: prop },
                            React.createElement('label', { htmlFor: `furniture-${String(prop)}`, className: "block text-slate-400 mb-1 capitalize" }, String(prop).replace('scale', 'Scale ')),
                            React.createElement('input', { type: "number", id: `furniture-${String(prop)}`, value: values[prop],
                                   onChange: handleChange(prop),
                                   onBlur: handleBlur(prop),
                                   step: String(prop).startsWith('scale') ? 0.01 : 1,
                                   onKeyDown: (e) => e.key === 'Enter' && e.target.blur(),
                                   className: "w-full bg-slate-700 text-white rounded px-2 py-1 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500"})
                        )
                    ))
                ),
                React.createElement('div', { className: "flex gap-2 mt-4" },
                    React.createElement('button', { onClick: duplicateSelectedFurniture, className: "w-full px-4 py-2 text-sm rounded-md font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors" }, "Duplicate"),
                    React.createElement('button', { onClick: deleteSelectedItem, className: "w-full px-4 py-2 text-sm rounded-md font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors" }, "Delete Furniture")
                )
            )
        );
    };
    
    const DoorProperties = ({ selectedDoor, updateSelectedDoor, deleteSelectedItem, duplicateSelectedDoor }) => {
        return (
            React.createElement('div', null,
                React.createElement('h3', { className: "text-lg font-semibold text-slate-300 mb-3" }, "Door Properties"),
                React.createElement('div', { className: "grid grid-cols-2 gap-x-4 gap-y-3 text-sm" },
                    React.createElement('div', null,
                        React.createElement('label', { htmlFor: "doorWidth", className: "block text-slate-400 mb-1" }, "Width"),
                        React.createElement('input', { type: "number", id: "doorWidth", value: selectedDoor.width,
                               onChange: (e) => updateSelectedDoor('width', parseFloat(e.target.value) || 0),
                               className: "w-full bg-slate-700 text-white rounded px-2 py-1 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500"})
                    ),
                     React.createElement('div', null,
                        React.createElement('label', { htmlFor: "doorOffset", className: "block text-slate-400 mb-1" }, "Offset from Start"),
                        React.createElement('input', { type: "number", id: "doorOffset", value: selectedDoor.offset.toFixed(1),
                               onChange: (e) => updateSelectedDoor('offset', parseFloat(e.target.value) || 0),
                               className: "w-full bg-slate-700 text-white rounded px-2 py-1 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500"})
                    ),
                     React.createElement('div', { className: "col-span-2" },
                        React.createElement('label', { htmlFor: "doorType", className: "block text-slate-400 mb-1" }, "Type"),
                        React.createElement('select', { id: "doorType", value: selectedDoor.type,
                                onChange: (e) => updateSelectedDoor('type', e.target.value),
                                className: "w-full bg-slate-700 text-white rounded px-2 py-1 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500"},
                            React.createElement('option', { value: "single" }, "Single"),
                            React.createElement('option', { value: "double" }, "Double"),
                            React.createElement('option', { value: "four-panel" }, "Four-Panel"),
                            React.createElement('option', { value: "sliding" }, "Sliding")
                        )
                    ),
                     React.createElement('div', null,
                        React.createElement('label', { htmlFor: "doorSwing", className: "block text-slate-400 mb-1" }, "Swing"),
                        React.createElement('select', { id: "doorSwing", value: selectedDoor.swing,
                                onChange: (e) => updateSelectedDoor('swing', e.target.value),
                                className: "w-full bg-slate-700 text-white rounded px-2 py-1 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500"},
                            React.createElement('option', { value: "left" }, "Left"),
                            React.createElement('option', { value: "right" }, "Right")
                        )
                    ),
                     React.createElement('div', null,
                        React.createElement('label', { htmlFor: "doorSide", className: "block text-slate-400 mb-1" }, "Opens From"),
                        React.createElement('select', { id: "doorSide", value: selectedDoor.side,
                                onChange: (e) => updateSelectedDoor('side', e.target.value),
                                className: "w-full bg-slate-700 text-white rounded px-2 py-1 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500"},
                            React.createElement('option', { value: "side1" }, "Side 1"),
                            React.createElement('option', { value: "side2" }, "Side 2")
                        )
                    )
                ),
                React.createElement('div', { className: "flex gap-2 mt-4" },
                    React.createElement('button', { onClick: duplicateSelectedDoor, className: "w-full px-4 py-2 text-sm rounded-md font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors" }, "Duplicate"),
                    React.createElement('button', { onClick: deleteSelectedItem, className: "w-full px-4 py-2 text-sm rounded-md font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors" }, "Delete Door")
                )
            )
        );
    }
    
    const WindowProperties = ({ selectedWindow, updateSelectedWindow, deleteSelectedItem, duplicateSelectedWindow }) => {
        return (
            React.createElement('div', null,
                React.createElement('h3', { className: "text-lg font-semibold text-slate-300 mb-3" }, "Window Properties"),
                React.createElement('div', { className: "grid grid-cols-2 gap-x-4 gap-y-3 text-sm" },
                    React.createElement('div', null,
                        React.createElement('label', { htmlFor: "windowWidth", className: "block text-slate-400 mb-1" }, "Width"),
                        React.createElement('input', { type: "number", id: "windowWidth", value: selectedWindow.width,
                               onChange: (e) => updateSelectedWindow('width', parseFloat(e.target.value) || 0),
                               className: "w-full bg-slate-700 text-white rounded px-2 py-1 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500"})
                    ),
                     React.createElement('div', null,
                        React.createElement('label', { htmlFor: "windowOffset", className: "block text-slate-400 mb-1" }, "Offset from Start"),
                        React.createElement('input', { type: "number", id: "windowOffset", value: selectedWindow.offset.toFixed(1),
                               onChange: (e) => updateSelectedWindow('offset', parseFloat(e.target.value) || 0),
                               className: "w-full bg-slate-700 text-white rounded px-2 py-1 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500"})
                    )
                ),
                 React.createElement('div', { className: "flex gap-2 mt-4" },
                    React.createElement('button', { onClick: duplicateSelectedWindow, className: "w-full px-4 py-2 text-sm rounded-md font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors" }, "Duplicate"),
                    React.createElement('button', { onClick: deleteSelectedItem, className: "w-full px-4 py-2 text-sm rounded-md font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors" }, "Delete Window")
                )
            )
        );
    };
    
    
    const ArcProperties = ({ selectedArc, updateSelectedArc, deleteSelectedItem, duplicateSelectedArc }) => {
        return (
            React.createElement('div', null,
                React.createElement('h3', { className: "text-lg font-semibold text-slate-300 mb-3" }, "Curve Properties"),
                React.createElement('div', { className: "space-y-3 text-sm" },
                    React.createElement('div', null,
                        React.createElement('label', { htmlFor: "arcThickness", className: "block text-slate-400 mb-1" }, "Thickness"),
                        React.createElement('input', { type: "number", id: "arcThickness", value: selectedArc.thickness,
                               onChange: (e) => updateSelectedArc('thickness', e.target.value),
                               className: "w-full bg-slate-700 text-white rounded px-2 py-1 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500"})
                    ),
                    React.createElement('div', null,
                        React.createElement('label', { htmlFor: "arcStyle", className: "block text-slate-400 mb-1" }, "Style"),
                        React.createElement('select', { id: "arcStyle", value: selectedArc.style || 'single',
                                onChange: (e) => updateSelectedArc('style', e.target.value),
                                className: "w-full bg-slate-700 text-white rounded px-2 py-1 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500"},
                            React.createElement('option', { value: "single" }, "Single"),
                            React.createElement('option', { value: "double" }, "Double"),
                            React.createElement('option', { value: "dashed" }, "Dashed")
                        )
                    )
                ),
                React.createElement('div', { className: "flex gap-2 mt-4" },
                    React.createElement('button', { onClick: duplicateSelectedArc, className: "w-full px-4 py-2 text-sm rounded-md font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors" }, "Duplicate"),
                    React.createElement('button', { onClick: deleteSelectedItem, className: "w-full px-4 py-2 text-sm rounded-md font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors" }, "Delete Curve")
                )
            )
        );
    };
    
    const CircularArcProperties = ({ selectedArc, updateSelectedArc, deleteSelectedItem, duplicateSelectedCircularArc }) => {
        const fields = ['cx', 'cy', 'radius', 'startAngle', 'endAngle', 'thickness'];
        return (
            React.createElement('div', null,
                React.createElement('h3', { className: "text-lg font-semibold text-slate-300 mb-3" }, "Circular Arc Properties"),
                React.createElement('div', { className: "grid grid-cols-2 gap-x-4 gap-y-3 text-sm" },
                    fields.map(prop => (
                        React.createElement('div', { key: prop },
                            React.createElement('label', { htmlFor: `circ-arc-${prop}`, className: "block text-slate-400 mb-1 capitalize" }, prop.replace('Angle', ' Angle (deg)')),
                            React.createElement('input', { type: "number", id: `circ-arc-${prop}`, value: selectedArc[prop],
                                   onChange: (e) => updateSelectedArc(prop, e.target.value),
                                   className: "w-full bg-slate-700 text-white rounded px-2 py-1 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500"})
                        )
                    )),
                     React.createElement('div', null,
                        React.createElement('label', { htmlFor: "arcStyle", className: "block text-slate-400 mb-1" }, "Style"),
                        React.createElement('select', { id: "arcStyle", value: selectedArc.style || 'single',
                                onChange: (e) => updateSelectedArc('style', e.target.value),
                                className: "w-full bg-slate-700 text-white rounded px-2 py-1 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500"},
                            React.createElement('option', { value: "single" }, "Single"),
                            React.createElement('option', { value: "double" }, "Double"),
                            React.createElement('option', { value: "dashed" }, "Dashed")
                        )
                    )
                ),
                React.createElement('div', { className: "flex gap-2 mt-4" },
                    React.createElement('button', { onClick: duplicateSelectedCircularArc, className: "w-full px-4 py-2 text-sm rounded-md font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors" }, "Duplicate"),
                    React.createElement('button', { onClick: deleteSelectedItem, className: "w-full px-4 py-2 text-sm rounded-md font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors" }, "Delete Arc")
                )
            )
        );
    };
    
    const RectangleProperties = ({ selectedRectangle, updateSelectedRectangle, deleteSelectedItem, duplicateSelectedRectangle }) => {
        const fields = ['x', 'y', 'width', 'height', 'rotation', 'thickness', 'topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'];
        const sideFields = ['showTop', 'showRight', 'showBottom', 'showLeft'];
        const labels = {
          x: 'Center X', y: 'Center Y', width: 'Width', height: 'Height', rotation: 'Rotation',
          thickness: 'Thickness',
          topLeftRadius: 'Top-L Radius', topRightRadius: 'Top-R Radius',
          bottomLeftRadius: 'Bot-L Radius', bottomRightRadius: 'Bot-R Radius'
        };
    
        return (
            React.createElement('div', null,
                React.createElement('h3', { className: "text-lg font-semibold text-slate-300 mb-3" }, "Rectangle Properties"),
                React.createElement('div', { className: "grid grid-cols-2 gap-x-4 gap-y-3 text-sm" },
                    fields.map(prop => (
                        React.createElement('div', { key: prop },
                            React.createElement('label', { htmlFor: `rect-${prop}`, className: "block text-slate-400 mb-1" }, labels[prop]),
                            React.createElement('input', { type: "number", id: `rect-${prop}`,
                                   value: selectedRectangle[prop],
                                   onChange: (e) => updateSelectedRectangle(prop, e.target.value),
                                   className: "w-full bg-slate-700 text-white rounded px-2 py-1 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500"})
                        )
                    )),
                    React.createElement('div', { className: "col-span-2" },
                        React.createElement('label', { htmlFor: "rect-style", className: "block text-slate-400 mb-1" }, "Style"),
                        React.createElement('select', { id: "rect-style", value: selectedRectangle.style || 'single',
                                onChange: (e) => updateSelectedRectangle('style', e.target.value),
                                className: "w-full bg-slate-700 text-white rounded px-2 py-1 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500"},
                            React.createElement('option', { value: "single" }, "Single"),
                            React.createElement('option', { value: "double" }, "Double"),
                            React.createElement('option', { value: "dashed" }, "Dashed")
                        )
                    )
                ),
                React.createElement('div', { className: "mt-4 pt-3 border-t border-slate-700" },
                     React.createElement('h4', { className: "text-md font-semibold text-slate-300 mb-2" }, "Visible Sides"),
                     React.createElement('div', { className: "grid grid-cols-2 gap-2 text-sm" },
                        sideFields.map(prop => (
                            React.createElement('div', { key: prop, className: "flex items-center" },
                                React.createElement('input', { type: "checkbox", id: `rect-${prop}`,
                                       checked: selectedRectangle[prop],
                                       onChange: (e) => updateSelectedRectangle(prop, e.target.checked),
                                       className: "h-4 w-4 rounded bg-slate-700 border-slate-600 text-cyan-500 focus:ring-cyan-500"}),
                                React.createElement('label', { htmlFor: `rect-${prop}`, className: "ml-2 text-slate-400" }, prop.replace('show', ''))
                            )
                        ))
                     )
                ),
                React.createElement('div', { className: "flex gap-2 mt-4" },
                    React.createElement('button', { onClick: duplicateSelectedRectangle, className: "w-full px-4 py-2 text-sm rounded-md font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors" }, "Duplicate"),
                    React.createElement('button', { onClick: deleteSelectedItem, className: "w-full px-4 py-2 text-sm rounded-md font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors" }, "Delete Rectangle")
                )
            )
        );
    };
    
    const DimensionLineProperties = ({ 
        selectedDimensionLine, 
        projectUnits, 
        updateSelectedDimensionLine, 
        updateSelectedDimensionLineLength, 
        deleteSelectedItem, 
        duplicateSelectedDimensionLine 
    }) => {
        const [lengthValue, setLengthValue] = useState('');
        const [offsetValue, setOffsetValue] = useState('');
    
        const derivedLength = useMemo(() => {
            const { x1, y1, x2, y2 } = selectedDimensionLine;
            return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        }, [selectedDimensionLine]);
    
        useEffect(() => {
            if (selectedDimensionLine) {
                setLengthValue(derivedLength.toFixed(1));
                setOffsetValue(selectedDimensionLine.offset.toString());
            }
        }, [selectedDimensionLine, derivedLength]);
        
        const handleLengthBlur = () => {
            const newLength = parseFloat(lengthValue);
            if (!isNaN(newLength) && newLength > 0 && newLength.toFixed(1) !== derivedLength.toFixed(1)) {
                updateSelectedDimensionLineLength(newLength);
            } else {
                setLengthValue(derivedLength.toFixed(1));
            }
        };
    
        const handleOffsetBlur = () => {
            const newOffset = parseFloat(offsetValue);
            if (selectedDimensionLine && !isNaN(newOffset) && newOffset !== selectedDimensionLine.offset) {
                updateSelectedDimensionLine("offset", newOffset);
            } else if (selectedDimensionLine) {
                setOffsetValue(selectedDimensionLine.offset.toString());
            }
        };
        
        return (
            React.createElement('div', null,
                React.createElement('h3', { className: "text-lg font-semibold text-slate-300 mb-3" }, "Dimension Properties"),
                React.createElement('div', { className: "space-y-3 text-sm" },
                    React.createElement('div', null,
                        React.createElement('label', { htmlFor: "dimLength", className: "block text-slate-400 mb-1" }, `Length (${projectUnits})`),
                        React.createElement('input', { type: "number", id: "dimLength", value: lengthValue,
                               onChange: (e) => setLengthValue(e.target.value),
                               onBlur: handleLengthBlur,
                               onKeyDown: (e) => e.key === 'Enter' && e.target.blur(),
                               className: "w-full bg-slate-700 text-white rounded px-2 py-1 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500"})
                    ),
                    React.createElement('div', null,
                        React.createElement('label', { htmlFor: "dimOffset", className: "block text-slate-400 mb-1" }, "Offset"),
                         React.createElement('input', { type: "number", id: "dimOffset",
                               value: offsetValue,
                               onChange: (e) => setOffsetValue(e.target.value),
                               onBlur: handleOffsetBlur,
                               onKeyDown: (e) => e.key === 'Enter' && e.target.blur(),
                               className: "w-full bg-slate-700 text-white rounded px-2 py-1 border border-slate-600 focus:ring-cyan-500 focus:border-cyan-500"})
                    )
                ),
                React.createElement('div', { className: "flex gap-2 mt-4" },
                    React.createElement('button', { onClick: duplicateSelectedDimensionLine, className: "w-full px-4 py-2 text-sm rounded-md font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors" }, "Duplicate"),
                    React.createElement('button', { onClick: deleteSelectedItem, className: "w-full px-4 py-2 text-sm rounded-md font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors" }, "Delete Dimension")
                )
            )
        );
    };
    
    
    const PropertiesPanel = (props) => {
        if (props.selectedWall) {
            return React.createElement(WallProperties, props);
        }
        if (props.selectedRoom) {
            return React.createElement(RoomProperties, props);
        }
        if (props.selectedText) {
            return React.createElement(TextProperties, props);
        }
        if (props.selectedFurniture) {
            return React.createElement(FurnitureProperties, props);
        }
        if (props.selectedDoor) {
            return React.createElement(DoorProperties, props);
        }
        if (props.selectedWindow) {
            return React.createElement(WindowProperties, props);
        }
        if (props.selectedArc) {
            return React.createElement(ArcProperties, props);
        }
        if (props.selectedCircularArc) {
            return React.createElement(CircularArcProperties, {
                selectedArc: props.selectedCircularArc,
                updateSelectedArc: props.updateSelectedCircularArc,
                deleteSelectedItem: props.deleteSelectedItem,
                duplicateSelectedCircularArc: props.duplicateSelectedCircularArc
            });
        }
        if (props.selectedRectangle) {
            return React.createElement(RectangleProperties, props);
        }
        if (props.selectedDimensionLine) {
            return React.createElement(DimensionLineProperties, props);
        }
        return (
            React.createElement('div', null,
                React.createElement('h3', { className: "text-lg font-semibold text-slate-300 mb-2" }, "Properties"),
                React.createElement('p', { className: "text-sm text-slate-400" }, "Select an object on the canvas to see its properties.")
            )
        );
    };

    // --- End of components/PropertiesPanel.tsx ---

    // Expose necessary parts to the global scope for part 2
    window.helpers = {
        pointToSegmentDistance,
        findClosestPointOnSegment,
        polarToCartesian,
        generateCircularArcPath,
        calculatePolygonArea,
        calculatePolygonCentroid,
        isPointInPolygon,
        findRoomFromPoint
    };
    window.Units = Units;
    window.furnitureLibrary = {
        FURNITURE_SHAPE_MAP,
        FURNITURE_LIBRARY,
        FURNITURE_DIMENSIONS,
        FurnitureRenderer
    };
    window.ActionButton = ActionButton;
    window.FurnitureLibraryUI = FurnitureLibraryUI;
    window.TraceImagePanel = TraceImagePanel;
    window.PropertiesPanel = PropertiesPanel;

})();