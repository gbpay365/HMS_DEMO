export function AclSwitch({ checked, onChange, disabled }) {
  return (
    <label className="relative inline-flex h-[22px] w-10 shrink-0 cursor-pointer">
      <input
        type="checkbox"
        className="peer sr-only"
        defaultChecked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span className="absolute inset-0 rounded-full bg-slate-300 transition peer-checked:bg-teal-600 peer-disabled:opacity-50" />
      <span className="absolute bottom-[3px] left-[3px] h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-[18px]" />
    </label>
  );
}
