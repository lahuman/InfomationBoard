
import React, {useState} from 'react'
import Remarkable from 'remarkable';
import { Row, Col, Input } from 'antd';
import Fullscreen from "react-full-screen";

import {MdContext, UrlContext, FullContext} from '../context';

import './fullcss.css';

const MarkdownEditor = (props) => {
 
  const  [md, setMd] = React.useContext(MdContext);
  const [url, ] = React.useContext(UrlContext);
  const [isFull, setIsFull] = React.useContext(FullContext);
  // const [isFull, setIsFull] = React.useState(true);
  const handleChange = (e) => {
    setMd(e.target.value);
  }

  const getRawMarkup = () => {
    const fullMd = new Remarkable('full', {
      html: true,
      linkify: true,
      typographer: true,
    });

    return { __html: fullMd.render(md) };
  }

  return (
    <Row justify="center" gutter={24}>
      <Col span={12}><Input.TextArea rows="20"
        id="markdown-content"
        onChange={handleChange}
        value={md}
        
      /></Col>
      <Col span={12} className="content">
        <Fullscreen className="fullscreen-enabled"
            enabled={isFull}
            onChange={iFl => setIsFull(iFl)}

          >
        <Row className="my-component">
          <Col span={24} dangerouslySetInnerHTML={getRawMarkup()} ></Col>
          <Col style={{ display: 'inline-flex', justifyContent: 'center', alignItems: 'center' }} span={24}>
            {url && (
              <img src={url} alt="" />
            )}
          </Col>

        </Row>
        </Fullscreen>
      </Col>

    </Row>
  );
}


export default MarkdownEditor;