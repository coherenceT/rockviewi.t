import '../styles/main.css';
import { initLayout } from '../components/layout';
import { initApplyForm } from '../features/apply/form';

const params = new URLSearchParams(window.location.search);

initLayout();
initApplyForm(params.get('pathway'));
