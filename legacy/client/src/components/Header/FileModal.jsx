import React, { useEffect, useRef } from 'react';
import { Modal } from 'antd';
import { FilePond } from 'react-filepond';
import 'filepond/dist/filepond.min.css';

export default (props) => {
  const {visible, okDisabled, toggle} = props.vals;
  const { onCancel, onOk, fileuploaded} = props.handles;
  const fileRef = useRef(null);
  const selfOk = () => {
    fileRef.current.removeFiles();
    onOk();
  }
  return (
    <Modal
      title="File Upload"
      visible={visible}
      onCancel={onCancel}
      onOk={selfOk}
      okButtonProps={{disabled: okDisabled}} >
      <FilePond name={"file"}  ref={fileRef} server="http://localhost:3001/upload" onprocessfile={fileuploaded} />
    </Modal>
  )
}