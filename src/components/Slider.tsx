import { Show } from "solid-js";

export interface SliderProps {
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  value: number;
  /** Swatch colour linking the slider to what it draws on the map. */
  color?: string;
  /** Draw the swatch faded, matching muted markers. */
  muted?: boolean;
  /** Display "off" instead of 0. */
  offAtZero?: boolean;
  onInput: (value: number) => void;
}

export default function Slider(props: SliderProps) {
  return (
    <label class="slider" title={props.hint}>
      <span class="slider-head">
        <span>
          <Show when={props.color}>
            <span class="swatch" classList={{ muted: props.muted }} style={{ background: props.color }} />
          </Show>
          {props.label}
        </span>
        <output>
          <Show when={!(props.offAtZero && props.value === 0)} fallback="off">
            {props.value} {props.unit}
          </Show>
        </output>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.valueAsNumber)}
      />
    </label>
  );
}
