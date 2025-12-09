import { useRef, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Heart, 
  Home, 
  Briefcase, 
  Users as UsersIcon, 
  Building, 
  HelpCircle,
  Crown,
  AlertTriangle,
  Ghost
} from 'lucide-react';
import ForceGraph2D from 'react-force-graph-2d';

interface NetworkMetrics {
  user_id: string;
  network_role: string;
  degree_centrality: number;
  unique_contacts: number;
  total_interactions: number;
}

interface RelationshipGraphProps {
  relationships: any[];
  networkMetrics?: NetworkMetrics[];
  onNodeClick?: (node: any) => void;
  onLinkClick?: (link: any) => void;
  showBurnoutIndicators?: boolean;
  burnoutUsers?: string[];
}

const relationshipColors: Record<string, string> = {
  romantic: '#ec4899',
  family: '#ef4444',
  'boss-employee': '#3b82f6',
  friends: '#22c55e',
  colleagues: '#a855f7',
  unknown: '#6b7280',
};

const relationshipIcons: Record<string, any> = {
  romantic: Heart,
  family: Home,
  'boss-employee': Briefcase,
  friends: UsersIcon,
  colleagues: Building,
  unknown: HelpCircle,
};

const networkRoleColors: Record<string, string> = {
  influencer: '#f59e0b',
  connector: '#3b82f6',
  regular: '#6b7280',
  outsider: '#ef4444',
};

export function RelationshipGraph({ 
  relationships, 
  networkMetrics = [],
  onNodeClick, 
  onLinkClick,
  showBurnoutIndicators = false,
  burnoutUsers = []
}: RelationshipGraphProps) {
  const forceRef = useRef<any>();
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [selectedLink, setSelectedLink] = useState<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const updateDimensions = () => {
      const container = document.getElementById('graph-container');
      if (container) {
        setDimensions({
          width: container.clientWidth,
          height: Math.max(600, window.innerHeight - 400)
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Create metrics lookup map
  const metricsMap = new Map<string, NetworkMetrics>();
  networkMetrics.forEach(m => metricsMap.set(m.user_id, m));

  // Transform relationships into graph data
  const graphData = (() => {
    if (!relationships || relationships.length === 0) {
      return { nodes: [], links: [] };
    }

    const nodesMap = new Map<string, any>();
    const links: any[] = [];

    relationships.forEach((rel) => {
      // Add nodes with network metrics
      if (rel.user_a && !nodesMap.has(rel.user_a.id)) {
        const metrics = metricsMap.get(rel.user_a.id);
        nodesMap.set(rel.user_a.id, {
          id: rel.user_a.id,
          name: rel.user_a.display_name,
          avatar: rel.user_a.avatar_url,
          // Node size based on centrality
          val: metrics ? 8 + (metrics.degree_centrality * 20) : 10,
          networkRole: metrics?.network_role || 'regular',
          degreeCentrality: metrics?.degree_centrality || 0,
          uniqueContacts: metrics?.unique_contacts || 0,
          totalInteractions: metrics?.total_interactions || 0,
          hasBurnoutRisk: burnoutUsers.includes(rel.user_a.id),
        });
      }
      if (rel.user_b && !nodesMap.has(rel.user_b.id)) {
        const metrics = metricsMap.get(rel.user_b.id);
        nodesMap.set(rel.user_b.id, {
          id: rel.user_b.id,
          name: rel.user_b.display_name,
          avatar: rel.user_b.avatar_url,
          val: metrics ? 8 + (metrics.degree_centrality * 20) : 10,
          networkRole: metrics?.network_role || 'regular',
          degreeCentrality: metrics?.degree_centrality || 0,
          uniqueContacts: metrics?.unique_contacts || 0,
          totalInteractions: metrics?.total_interactions || 0,
          hasBurnoutRisk: burnoutUsers.includes(rel.user_b.id),
        });
      }

      // Add link with direction indicator
      if (rel.user_a && rel.user_b) {
        links.push({
          source: rel.user_a.id,
          target: rel.user_b.id,
          relationshipType: rel.relationship_type || 'unknown',
          confidence: rel.confidence_score || 0,
          interactionCount: rel.interaction_count || 0,
          evidence: rel.inferred_data?.evidence || [],
          relationshipId: rel.id,
        });
      }
    });

    return {
      nodes: Array.from(nodesMap.values()),
      links,
    };
  })();

  const handleNodeClick = (node: any) => {
    setSelectedNode(node);
    setSelectedLink(null);
    onNodeClick?.(node);
  };

  const handleLinkClick = (link: any) => {
    setSelectedLink(link);
    setSelectedNode(null);
    onLinkClick?.(link);
  };

  const getNodeColor = (node: any) => {
    if (node === selectedNode) return 'hsl(var(--primary))';
    if (showBurnoutIndicators && node.hasBurnoutRisk) return '#ef4444';
    return networkRoleColors[node.networkRole] || 'hsl(var(--accent))';
  };

  const getNetworkRoleIcon = (role: string) => {
    switch (role) {
      case 'influencer': return Crown;
      case 'outsider': return Ghost;
      default: return null;
    }
  };

  if (graphData.nodes.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <UsersIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>No relationships to visualize</p>
        <p className="text-xs mt-1">
          Relationships will appear as users interact in the group
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div id="graph-container" className="relative border rounded-lg overflow-hidden bg-background">
        <ForceGraph2D
          ref={forceRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          nodeLabel="name"
          nodeAutoColorBy="id"
          nodeCanvasObject={(node: any, ctx: any, globalScale: number) => {
            const label = node.name;
            const fontSize = 12 / globalScale;
            const nodeRadius = Math.max(6, node.val / 2);

            // Draw node circle with role-based color
            ctx.beginPath();
            ctx.arc(node.x, node.y, nodeRadius, 0, 2 * Math.PI, false);
            ctx.fillStyle = getNodeColor(node);
            ctx.fill();
            ctx.strokeStyle = 'hsl(var(--border))';
            ctx.lineWidth = 1.5 / globalScale;
            ctx.stroke();

            // Draw burnout warning ring
            if (showBurnoutIndicators && node.hasBurnoutRisk) {
              ctx.beginPath();
              ctx.arc(node.x, node.y, nodeRadius + 3, 0, 2 * Math.PI, false);
              ctx.strokeStyle = '#ef4444';
              ctx.lineWidth = 2 / globalScale;
              ctx.setLineDash([4, 2]);
              ctx.stroke();
              ctx.setLineDash([]);
            }

            // Draw influencer crown indicator
            if (node.networkRole === 'influencer') {
              ctx.fillStyle = '#f59e0b';
              ctx.font = `${fontSize * 1.2}px Sans-Serif`;
              ctx.textAlign = 'center';
              ctx.fillText('👑', node.x, node.y - nodeRadius - 4);
            }

            // Draw outsider indicator
            if (node.networkRole === 'outsider') {
              ctx.fillStyle = '#6b7280';
              ctx.font = `${fontSize}px Sans-Serif`;
              ctx.textAlign = 'center';
              ctx.fillText('👻', node.x, node.y - nodeRadius - 4);
            }

            // Draw label
            ctx.font = `${fontSize}px Sans-Serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'hsl(var(--foreground))';
            ctx.fillText(label, node.x, node.y + nodeRadius + fontSize + 2);
          }}
          linkWidth={(link: any) => {
            const baseWidth = 2;
            const confidenceMultiplier = link.confidence || 0.5;
            return baseWidth * confidenceMultiplier;
          }}
          linkColor={(link: any) => {
            const type = link.relationshipType || 'unknown';
            return link === selectedLink 
              ? 'hsl(var(--primary))' 
              : relationshipColors[type] || '#6b7280';
          }}
          linkDirectionalArrowLength={6}
          linkDirectionalArrowRelPos={0.8}
          linkDirectionalParticles={2}
          linkDirectionalParticleWidth={(link: any) => link === selectedLink ? 4 : 2}
          linkDirectionalParticleSpeed={(link: any) => link.confidence * 0.01}
          linkLabel={(link: any) => {
            const type = (link.relationshipType || 'unknown').replace('-', ' ');
            return `${type} (${Math.round((link.confidence || 0) * 100)}% confident)`;
          }}
          onNodeClick={handleNodeClick}
          onLinkClick={handleLinkClick}
          cooldownTicks={100}
          onEngineStop={() => forceRef.current?.zoomToFit(400)}
          enableNodeDrag={true}
          enableZoomInteraction={true}
          enablePanInteraction={true}
        />
        
        {/* Legend */}
        <div className="absolute top-4 left-4 bg-background/95 backdrop-blur-sm border rounded-lg p-3 shadow-lg max-w-[200px]">
          <p className="text-xs font-semibold mb-2">Relationship Types</p>
          <div className="space-y-1">
            {Object.entries(relationshipColors).map(([type, color]) => {
              const Icon = relationshipIcons[type];
              return (
                <div key={type} className="flex items-center gap-2 text-xs">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: color }}
                  />
                  <Icon className="w-3 h-3" />
                  <span className="capitalize">{type.replace('-', ' ')}</span>
                </div>
              );
            })}
          </div>
          
          {networkMetrics.length > 0 && (
            <>
              <div className="my-2 border-t" />
              <p className="text-xs font-semibold mb-2">Network Roles</p>
              <div className="space-y-1">
                {Object.entries(networkRoleColors).map(([role, color]) => (
                  <div key={role} className="flex items-center gap-2 text-xs">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: color }}
                    />
                    <span className="capitalize">{role}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          
          <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
            <p>• Node size = centrality</p>
            <p>• Line thickness = confidence</p>
            <p>• Drag nodes to rearrange</p>
          </div>
        </div>
      </div>

      {/* Selected Node/Link Info Panel */}
      {(selectedNode || selectedLink) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              {selectedNode ? 'User Details' : 'Relationship Details'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedNode && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center font-semibold">
                    {selectedNode.name?.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{selectedNode.name}</p>
                      {selectedNode.networkRole === 'influencer' && (
                        <Badge variant="outline" className="text-amber-500 border-amber-500 text-xs">
                          <Crown className="w-3 h-3 mr-1" />
                          Influencer
                        </Badge>
                      )}
                      {selectedNode.networkRole === 'outsider' && (
                        <Badge variant="outline" className="text-muted-foreground text-xs">
                          <Ghost className="w-3 h-3 mr-1" />
                          Outsider
                        </Badge>
                      )}
                      {selectedNode.hasBurnoutRisk && (
                        <Badge variant="destructive" className="text-xs">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Burnout Risk
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {graphData.links.filter(
                        (l: any) => l.source.id === selectedNode.id || l.target.id === selectedNode.id
                      ).length} connections
                    </p>
                  </div>
                </div>
                
                {/* Network metrics */}
                {selectedNode.degreeCentrality > 0 && (
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                    <div className="text-center">
                      <p className="text-lg font-semibold">{(selectedNode.degreeCentrality * 100).toFixed(0)}%</p>
                      <p className="text-xs text-muted-foreground">Centrality</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold">{selectedNode.uniqueContacts}</p>
                      <p className="text-xs text-muted-foreground">Contacts</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold">{selectedNode.totalInteractions}</p>
                      <p className="text-xs text-muted-foreground">Interactions</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedLink && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {typeof selectedLink.source === 'object' 
                        ? selectedLink.source.name 
                        : graphData.nodes.find((n: any) => n.id === selectedLink.source)?.name}
                    </span>
                    <span className="text-muted-foreground">↔</span>
                    <span className="text-sm font-medium">
                      {typeof selectedLink.target === 'object'
                        ? selectedLink.target.name
                        : graphData.nodes.find((n: any) => n.id === selectedLink.target)?.name}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge 
                    variant="outline" 
                    className="capitalize"
                    style={{ 
                      borderColor: relationshipColors[selectedLink.relationshipType],
                      color: relationshipColors[selectedLink.relationshipType]
                    }}
                  >
                    {selectedLink.relationshipType?.replace('-', ' ')}
                  </Badge>
                  <Badge variant="secondary">
                    {Math.round(selectedLink.confidence * 100)}% confident
                  </Badge>
                </div>

                <div className="text-sm">
                  <p className="text-muted-foreground">
                    {selectedLink.interactionCount} interactions observed
                  </p>
                </div>

                {selectedLink.evidence && selectedLink.evidence.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium">Evidence:</p>
                    <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-0.5">
                      {selectedLink.evidence.slice(0, 3).map((ev: string, i: number) => (
                        <li key={i}>{ev}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}