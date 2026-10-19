import { CHARACTERS } from '../shared/game';

interface Props {
  id: string;
  className: string;
  color?: string;
}

export function CharacterAvatar({ id, className, color }: Props) {
  const character = CHARACTERS.find((item) => item.id === id);
  if (!character) return <span className={className}>{id || '?'}</span>;

  return (
    <span className={`${className} character-art`} style={color ? { background: color } : undefined}>
      <img src={`/assets/characters/${character.id}.jpg`} alt={character.name} />
    </span>
  );
}
