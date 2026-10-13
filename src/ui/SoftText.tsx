/**
 * Text that arrives out of soft focus into sharp (styles.css `.soft`): a still, soft copy of it fades out as the sharp text
 * fades up, so it reads as a focus pull without ever animating a blur. Plays once, when it mounts.
 */
export function SoftText({ text }: { text: string }) {
  return <span className="soft soft-in" data-soft={text}><span className="soft-s">{text}</span></span>;
}
