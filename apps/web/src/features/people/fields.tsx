/**
 * Re-exportación de compatibilidad (spec §8 y decisión D-95):
 * Los campos y el estado de carga se movieron a apps/web/src/components/.
 */
export {
  CheckboxField,
  SelectField,
  TextAreaField,
  TextField,
  type FieldProps,
  type SelectProps,
  type TextAreaProps,
} from '../../components/fields.tsx';

export { LoadState, type LoadStateProps } from '../../components/LoadState.tsx';
