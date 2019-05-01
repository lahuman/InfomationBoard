
import React, { useState } from 'react'
import Remarkable from 'remarkable';
import { Row, Col, Input } from 'antd';


const MarkdownEditor = (props) => {
  const [value, setValue] = useState('Hello, **world**!');
  const qrcod = props.qrcode;

  const handleChange = (e) => {
    setValue(e.target.value);
  }

  const getRawMarkup = () => {
    const md = new Remarkable('full', {
      html: true,
      linkify: true,
      typographer: true,
    });

    return { __html: md.render(value) };
  }


  function createMarkup() { return { __html: qrcod }; };
  return (
    <Row justify="center" gutter={24}>
      <Col span={12}><Input.TextArea rows="20"
        id="markdown-content"
        onChange={handleChange}
        defaultValue={value}
      /></Col>
      <Col span={12} className="content">

        <Row >
          <Col span={24} dangerouslySetInnerHTML={getRawMarkup()} ></Col>
          <Col style={{ display: 'inline-flex', justifyContent: 'center', alignItems: 'center' }} span={24} dangerouslySetInnerHTML={createMarkup()} ></Col>

        </Row>
      </Col>

    </Row>
  );
}


export default MarkdownEditor;