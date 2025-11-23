import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, ResponsiveContainer } from 'recharts';

interface PersonalityRadarChartProps {
  traits: Record<string, number>;
  userName?: string;
}

export function PersonalityRadarChart({ traits, userName }: PersonalityRadarChartProps) {
  const data = Object.entries(traits).map(([trait, value]) => ({
    trait: trait.charAt(0).toUpperCase() + trait.slice(1).replace('_', ' '),
    value: typeof value === 'number' ? value : 0.5,
  }));
  
  return (
    <ResponsiveContainer width="100%" height={200} className="sm:h-[250px]">
      <RadarChart data={data}>
        <PolarGrid stroke="hsl(var(--border))" />
        <PolarAngleAxis 
          dataKey="trait" 
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
          className="sm:text-xs"
        />
        <PolarRadiusAxis 
          angle={90} 
          domain={[0, 1]} 
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
        />
        <Radar 
          name={userName || 'User'} 
          dataKey="value" 
          stroke="hsl(var(--primary))" 
          fill="hsl(var(--primary))" 
          fillOpacity={0.6} 
        />
        <Legend wrapperStyle={{ fontSize: '10px' }} className="sm:text-xs" />
      </RadarChart>
    </ResponsiveContainer>
  );
}
