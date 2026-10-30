import { TextField } from "../../ui/TextField.tsx";

export interface TractorValues {
  regNumber: string;
  label: string;
}

/** Registration and a name to know it by: the same fields when adding and editing. */
export function TractorFields({
  values,
  errors,
  onChange,
}: {
  values: TractorValues;
  errors: Record<string, string>;
  onChange: (values: TractorValues) => void;
}) {
  return (
    <>
      <TextField
        label="Registration number"
        placeholder="RJ 21 RA 4412"
        autoCapitalize="characters"
        value={values.regNumber}
        error={errors["regNumber"]}
        onChange={(event) => {
          onChange({ ...values, regNumber: event.target.value });
        }}
      />
      <TextField
        label="Name to know it by"
        placeholder="Mahindra 575"
        value={values.label}
        error={errors["label"]}
        onChange={(event) => {
          onChange({ ...values, label: event.target.value });
        }}
      />
    </>
  );
}
